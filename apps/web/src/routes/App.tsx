import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  Check,
  FolderOpen,
  Play,
  RefreshCw,
  Upload,
  WandSparkles,
} from "lucide-react";
import type {
  CreativeWorkspace,
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  ShotPromptArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import {
  approveWorkspaceBrief,
  approveWorkspaceShotPrompt,
  approveWorkspaceStoryboard,
  compileWorkspaceShotPrompt,
  getWorkspaceStatus,
  initializeWorkspace,
  listWorkspaces,
  proposeWorkspaceBrief,
  proposeWorkspaceStoryboard,
  routeWorkspaceFeedback,
  runWorkspaceMaterialIntake,
  selectWorkspaceDirectory,
  startWorkspaceVideo,
  uploadWorkspaceMaterial,
  type ArtifactFormContract,
  type ArtifactFormField,
  type RuntimePromptView,
  type WorkspaceArtifactDetail,
  type WorkspaceMaterialLibrary,
  type WorkspaceStatusDetail,
} from "../lib/api/client.js";
import { useGenerationJob } from "../lib/job/useGenerationJob.js";
import { JobProgress } from "../features/creation/JobProgress.js";
import { VideoPreview } from "../features/creation/VideoPreview.js";

export function App() {
  const [workspacePath, setWorkspacePath] = useState("");
  const [manualPathOpen, setManualPathOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<CreativeWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [status, setStatus] = useState<WorkspaceStatusDetail | null>(null);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [briefDirection, setBriefDirection] = useState("");
  const [material, setMaterial] =
    useState<WorkspaceArtifactDetail<MaterialIntakeArtifact> | null>(null);
  const [brief, setBrief] =
    useState<WorkspaceArtifactDetail<ProductBriefArtifact> | null>(null);
  const [briefDraft, setBriefDraft] = useState<ProductBriefArtifact | null>(
    null,
  );
  const [storyboard, setStoryboard] =
    useState<WorkspaceArtifactDetail<StoryboardArtifact> | null>(null);
  const [storyboardDraft, setStoryboardDraft] =
    useState<StoryboardArtifact | null>(null);
  const [shotPrompt, setShotPrompt] =
    useState<WorkspaceArtifactDetail<ShotPromptArtifact> | null>(null);
  const [shotPromptDraft, setShotPromptDraft] =
    useState<ShotPromptArtifact | null>(null);
  const [selectedMaterialRefs, setSelectedMaterialRefs] = useState<string[]>(
    [],
  );
  const [briefFieldErrors, setBriefFieldErrors] = useState<
    Record<string, string>
  >({});
  const [storyboardFieldErrors, setStoryboardFieldErrors] = useState<
    Record<string, string>
  >({});
  const [shotPromptFieldErrors, setShotPromptFieldErrors] = useState<
    Record<string, string>
  >({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [feedbackRoute, setFeedbackRoute] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobQuery = useGenerationJob(jobId);

  const selectedWorkspace =
    status?.workspace ??
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const workspaceId = selectedWorkspace?.id ?? "";
  const workspacePathDisplay =
    selectedWorkspace?.localPath || workspacePath || "尚未选择工作目录";
  const nextAction = status?.nextAction;
  const runtimeProviderLabel = nextAction
    ? (nextAction.provider ??
      (nextAction.runtimeMode === "mock" ? "local builder" : nextAction.actionType))
    : "select workspace";
  const materialLibrary = material?.artifact.data ?? status?.materialLibrary;
  const materialCandidateRefs = useMemo(
    () => materialLibrary?.assets.map((asset) => asset.ref) ?? [],
    [materialLibrary],
  );

  useEffect(() => {
    void refreshWorkspaceList();
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId || status?.workspace.id === selectedWorkspaceId) {
      return;
    }

    const selected = workspaces.find(
      (workspace) => workspace.id === selectedWorkspaceId,
    );
    if (selected) {
      void refreshStatus(selected);
    }
  }, [selectedWorkspaceId, status?.workspace.id, workspaces]);

  useEffect(() => {
    if (status?.workspace.currentJobId) {
      setJobId(status.workspace.currentJobId);
    }
  }, [status?.workspace.currentJobId]);

  useEffect(() => {
    if (!status?.artifacts) {
      return;
    }

    setMaterial((current) =>
      status.artifacts?.material
        ? {
            workspace: status.workspace,
            artifact: status.artifacts.material,
            promptView: current?.promptView,
          }
        : null,
    );
    setBrief((current) => {
      if (!status.artifacts?.brief) {
        setBriefDraft(null);
        return null;
      }
      setBriefDraft(status.artifacts.brief.data);
      return {
        workspace: status.workspace,
        artifact: status.artifacts.brief,
        promptView: current?.promptView,
        form: current?.form,
      };
    });
    setStoryboard((current) => {
      if (!status.artifacts?.storyboard) {
        setStoryboardDraft(null);
        return null;
      }
      setStoryboardDraft(status.artifacts.storyboard.data);
      return {
        workspace: status.workspace,
        artifact: status.artifacts.storyboard,
        promptView: current?.promptView,
        form: current?.form,
      };
    });
    setShotPrompt((current) => {
      if (!status.artifacts?.shotPrompt) {
        setShotPromptDraft(null);
        return null;
      }
      const normalized = normalizeShotPromptDraft(
        status.artifacts.shotPrompt.data,
      );
      setShotPromptDraft(normalized);
      return {
        workspace: status.workspace,
        artifact: { ...status.artifacts.shotPrompt, data: normalized },
        promptView: current?.promptView,
        form: current?.form,
      };
    });
  }, [status]);

  useEffect(() => {
    setSelectedMaterialRefs((current) => {
      const candidates = new Set(materialCandidateRefs);
      const retained = current.filter((ref) => candidates.has(ref));
      if (retained.length > 0 || materialCandidateRefs.length === 0) {
        return retained;
      }
      return materialCandidateRefs;
    });
  }, [materialCandidateRefs]);

  const stageStatus = useMemo(
    () =>
      deriveStageStatus(selectedWorkspace, {
        material,
        brief,
        storyboard,
        shotPrompt,
      }),
    [brief, material, selectedWorkspace, shotPrompt, storyboard],
  );

  async function runAction<T>(label: string, action: () => Promise<T>) {
    setBusyAction(label);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${label} 失败`);
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshWorkspaceList() {
    const result = await runAction("刷新工作目录", listWorkspaces);
    if (!result) {
      return;
    }
    setWorkspaces(result.workspaces);
  }

  function selectWorkspace(workspace: CreativeWorkspace) {
    setSelectedWorkspaceId(workspace.id);
    setWorkspacePath(workspace.localPath);
    setStatus(null);
    setSelectedMaterialRefs([]);
    setMaterial(null);
    setBrief(null);
    setBriefDraft(null);
    setStoryboard(null);
    setStoryboardDraft(null);
    setShotPrompt(null);
    setShotPromptDraft(null);
    setBriefFieldErrors({});
    setStoryboardFieldErrors({});
    setShotPromptFieldErrors({});
    setFeedbackRoute(null);
    setJobId(workspace.currentJobId ?? null);
  }

  async function refreshStatus(workspace = selectedWorkspace) {
    if (!workspace) {
      setError("请先选择一个工作目录");
      return;
    }
    const result = await runAction("刷新状态", () =>
      getWorkspaceStatus(workspace.id),
    );
    if (result) {
      setStatus(result);
      setWorkspaces((current) => upsertWorkspace(current, result.workspace));
    }
  }

  async function handleWorkspaceChange(event: ChangeEvent<HTMLSelectElement>) {
    if (!event.target.value) {
      setSelectedWorkspaceId("");
      setWorkspacePath("");
      setStatus(null);
      setSelectedMaterialRefs([]);
      setMaterial(null);
      setBrief(null);
      setBriefDraft(null);
      setStoryboard(null);
      setStoryboardDraft(null);
      setShotPrompt(null);
      setShotPromptDraft(null);
      setBriefFieldErrors({});
      setStoryboardFieldErrors({});
      setShotPromptFieldErrors({});
      setFeedbackRoute(null);
      setJobId(null);
      return;
    }

    const workspace = workspaces.find(
      (candidate) => candidate.id === event.target.value,
    );
    if (workspace) {
      selectWorkspace(workspace);
      await refreshStatus(workspace);
    }
  }

  async function openWorkspaceDirectory(directory: string) {
    const initialized = await initializeWorkspace(directory);
    setWorkspaces((current) => upsertWorkspace(current, initialized.workspace));
    selectWorkspace(initialized.workspace);
    await refreshStatus(initialized.workspace);
  }

  async function handleSelectDirectory() {
    await runAction("选择工作目录", async () => {
      const selected = await selectWorkspaceDirectory();
      if (selected.cancelled) {
        return;
      }
      if (!selected.directory) {
        setManualPathOpen(true);
        throw new Error("当前环境无法打开目录选择器，请展开手动输入路径。");
      }
      await openWorkspaceDirectory(selected.directory);
    });
  }

  async function handleOpenManualPath() {
    const directory = workspacePath.trim();
    if (!directory) {
      setError("请先输入工作目录路径");
      return;
    }
    await runAction("打开目录", () => openWorkspaceDirectory(directory));
  }

  async function handleImportMaterials(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!selectedWorkspace || files.length === 0) {
      return;
    }
    const result = await runAction("导入素材", async () => {
      for (const file of files) {
        await uploadWorkspaceMaterial({
          workspaceId: selectedWorkspace.id,
          file,
        });
      }
      return true;
    });
    event.target.value = "";
    if (result) {
      await refreshStatus(selectedWorkspace);
    }
  }

  async function handleMaterialIntake() {
    const result = await runAction("素材清点", () =>
      runWorkspaceMaterialIntake({
        workspaceId,
        prompt: initialPrompt.trim() || undefined,
        selectedMaterialRefs,
      }),
    );
    if (result) {
      setMaterial(result);
      await refreshStatus(result.workspace);
    }
  }

  async function handleProposeBrief() {
    const result = await runAction("生成产品概述", () =>
      proposeWorkspaceBrief({
        workspaceId,
        userDirection: briefDirection.trim() || undefined,
      }),
    );
    if (result) {
      setBrief(result);
      setBriefDraft(result.artifact.data);
      await refreshStatus(result.workspace);
    }
  }

  async function handleApproveBrief() {
    if (!brief) {
      return;
    }
    const draft = briefDraft ?? brief.artifact.data;
    const fieldErrors = validateArtifactRequiredFields(
      draft,
      brief.form ?? inferFormContract(draft),
    );
    if (Object.keys(fieldErrors).length > 0) {
      setBriefFieldErrors(fieldErrors);
      setError(null);
      return;
    }
    setBriefFieldErrors({});
    const result = await runAction("确认产品概述", () =>
      approveWorkspaceBrief(workspaceId, draft),
    );
    if (result) {
      setBrief(result);
      setBriefDraft(result.artifact.data);
      await refreshStatus(result.workspace);
    }
  }

  async function handleProposeStoryboard() {
    const result = await runAction("生成 UGC 分镜", () =>
      proposeWorkspaceStoryboard(workspaceId),
    );
    if (result) {
      setStoryboard(result);
      setStoryboardDraft(result.artifact.data);
      await refreshStatus(result.workspace);
    }
  }

  async function handleApproveStoryboard() {
    if (!storyboard) {
      return;
    }
    const draft = storyboardDraft ?? storyboard.artifact.data;
    const fieldErrors = validateArtifactRequiredFields(
      draft,
      storyboard.form ?? inferFormContract(draft),
    );
    if (Object.keys(fieldErrors).length > 0) {
      setStoryboardFieldErrors(fieldErrors);
      setError(null);
      return;
    }
    setStoryboardFieldErrors({});
    const result = await runAction("确认 UGC 分镜", () =>
      approveWorkspaceStoryboard(workspaceId, draft),
    );
    if (result) {
      setStoryboard(result);
      setStoryboardDraft(result.artifact.data);
      await refreshStatus(result.workspace);
    }
  }

  async function handleCompileShotPrompt() {
    const result = await runAction("生成视频剧本", () =>
      compileWorkspaceShotPrompt({
        workspaceId,
        aspectRatio: "9:16",
      }),
    );
    if (result) {
      const normalized = normalizeShotPromptDraft(result.artifact.data);
      setShotPrompt({
        ...result,
        artifact: { ...result.artifact, data: normalized },
      });
      setShotPromptDraft(normalized);
      await refreshStatus(result.workspace);
    }
  }

  async function handleApproveShotPrompt() {
    if (!shotPrompt) {
      return;
    }
    const draft = shotPromptDraft ?? shotPrompt.artifact.data;
    const fieldErrors = validateArtifactRequiredFields(
      draft,
      shotPrompt.form ?? inferFormContract(draft),
    );
    if (Object.keys(fieldErrors).length > 0) {
      setShotPromptFieldErrors(fieldErrors);
      setError(null);
      return;
    }
    setShotPromptFieldErrors({});
    const result = await runAction("确认视频剧本", () =>
      approveWorkspaceShotPrompt(workspaceId, draft),
    );
    if (result) {
      const normalized = normalizeShotPromptDraft(result.artifact.data);
      setShotPrompt({
        ...result,
        artifact: { ...result.artifact, data: normalized },
      });
      setShotPromptDraft(normalized);
      await refreshStatus(result.workspace);
    }
  }

  async function handleStartVideo() {
    const result = await runAction("启动视频生成", () =>
      startWorkspaceVideo(workspaceId),
    );
    if (result) {
      setJobId(result.job.id);
      await refreshStatus(result.workspace);
    }
  }

  async function handleVideoFeedback(feedback: string) {
    const result = await runAction("提交成片反馈", () =>
      routeWorkspaceFeedback({
        workspaceId,
        feedback,
        jobId: jobId ?? undefined,
      }),
    );
    if (!result) {
      return;
    }
    setFeedbackRoute(`${result.route.targetArtifact}: ${result.route.reason}`);
    if (result.route.targetArtifact === "brief") {
      const detail = {
        workspace: result.workspace,
        artifact:
          result.artifact as WorkspaceArtifactDetail<ProductBriefArtifact>["artifact"],
        promptView: brief?.promptView,
        form: brief?.form,
      };
      setBrief(detail);
      setBriefDraft(detail.artifact.data);
    }
    if (result.route.targetArtifact === "storyboard") {
      const detail = {
        workspace: result.workspace,
        artifact:
          result.artifact as WorkspaceArtifactDetail<StoryboardArtifact>["artifact"],
        promptView: storyboard?.promptView,
        form: storyboard?.form,
      };
      setStoryboard(detail);
      setStoryboardDraft(detail.artifact.data);
    }
    if (result.route.targetArtifact === "shotprompt") {
      const artifact =
        result.artifact as WorkspaceArtifactDetail<ShotPromptArtifact>["artifact"];
      const normalized = normalizeShotPromptDraft(artifact.data);
      setShotPrompt({
        workspace: result.workspace,
        artifact: { ...artifact, data: normalized },
        promptView: shotPrompt?.promptView,
        form: shotPrompt?.form,
      });
      setShotPromptDraft(normalized);
    }
    await refreshStatus(result.workspace);
  }

  const jobDetail = jobQuery.data;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Daireel V1 Workspace</p>
          <h1>四步骤视频生成服务</h1>
        </div>
        <div className="runtime-badge">
          <span>{nextAction?.runtimeMode ?? "pending"}</span>
          <strong>{runtimeProviderLabel}</strong>
        </div>
      </header>

      <section className="control-strip workspace-entry-strip">
        <div className="workspace-entry">
          <span className="field-label">工作目录</span>
          <label className="history-selector">
            <span>最近工作目录</span>
            <select
              value={selectedWorkspaceId}
              onChange={(event) => void handleWorkspaceChange(event)}
            >
              <option value="">选择最近工作目录</option>
              {workspaces.map((workspace) => (
                <option value={workspace.id} key={workspace.id}>
                  {workspaceLabel(workspace)}
                </option>
              ))}
            </select>
          </label>
          <div className="directory-display">
            <input
              aria-label="当前工作目录"
              value={workspacePathDisplay}
              readOnly
            />
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(busyAction)}
              onClick={() => void handleSelectDirectory()}
            >
              <FolderOpen size={18} />
              选择工作目录
            </button>
          </div>
          <details
            className="manual-path"
            open={manualPathOpen}
            onToggle={(event) => setManualPathOpen(event.currentTarget.open)}
          >
            <summary>手动输入路径</summary>
            <div className="manual-path-row">
              <input
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder="/Users/.../my-product-campaign"
              />
              <button
                type="button"
                className="secondary-button"
                disabled={Boolean(busyAction)}
                onClick={() => void handleOpenManualPath()}
              >
                打开目录
              </button>
            </div>
          </details>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={Boolean(busyAction)}
            onClick={() => void refreshWorkspaceList()}
          >
            <RefreshCw size={18} />
            刷新目录
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!selectedWorkspace || Boolean(busyAction)}
            onClick={() => void refreshStatus()}
          >
            <RefreshCw size={18} />
            刷新状态
          </button>
        </div>
      </section>

      <MaterialImportStrip
        busyAction={busyAction}
        materialLibrary={materialLibrary}
        selectedWorkspace={selectedWorkspace}
        onImportMaterials={handleImportMaterials}
      />

      {error ? <p className="error banner-error">{error}</p> : null}
      {busyAction ? <p className="busy-line">{busyAction}...</p> : null}

      <div className="workspace-grid v1-grid">
        <StagePanel
          index="0"
          title="素材清点"
          status={stageStatus.material}
          action={
            <button
              type="button"
              disabled={!selectedWorkspace || Boolean(busyAction)}
              onClick={handleMaterialIntake}
            >
              <WandSparkles size={18} />
              运行素材清点
            </button>
          }
        >
          <label>
            <span>初始需求</span>
            <textarea
              rows={3}
              value={initialPrompt}
              onChange={(event) => setInitialPrompt(event.target.value)}
              placeholder="比如：生成办公室场景的自然 UGC 带货视频"
            />
          </label>
          <MaterialLibraryPreview
            library={materialLibrary}
            selectedRefs={selectedMaterialRefs}
            onSelectedRefsChange={setSelectedMaterialRefs}
          />
          <MaterialSummary
            artifact={material?.artifact.data}
            promptView={material?.promptView}
          />
        </StagePanel>

        <StagePanel
          index="1"
          title="产品概述"
          status={stageStatus.brief}
          action={
            <div className="button-row">
              <button
                type="button"
                disabled={!material || Boolean(busyAction)}
                onClick={handleProposeBrief}
              >
                <WandSparkles size={18} />
                生成 Brief
              </button>
              <button
                type="button"
                className="approve-button"
                disabled={
                  !brief ||
                  brief.artifact.status === "approved" ||
                  Boolean(busyAction)
                }
                onClick={handleApproveBrief}
              >
                <Check size={18} />
                确认
              </button>
            </div>
          }
        >
          <label>
            <span>可选方向</span>
            <textarea
              rows={3}
              value={briefDirection}
              onChange={(event) => setBriefDirection(event.target.value)}
              placeholder="可留空。比如：更适合办公室通勤人群，语气自然可信"
            />
          </label>
          <PromptPreview promptView={brief?.promptView} />
          <ArtifactFormEditor
            data={briefDraft}
            form={brief?.form}
            materialLibrary={materialLibrary}
            emptyLabel="等待产品概述"
            onChange={setBriefDraft}
            fieldErrors={briefFieldErrors}
            onFieldChange={(pathName) =>
              setBriefFieldErrors((current) => omitKey(current, pathName))
            }
          />
        </StagePanel>

        <StagePanel
          index="2"
          title="UGC 分镜"
          status={stageStatus.storyboard}
          action={
            <div className="button-row">
              <button
                type="button"
                disabled={
                  brief?.artifact.status !== "approved" || Boolean(busyAction)
                }
                onClick={handleProposeStoryboard}
              >
                <WandSparkles size={18} />
                生成分镜
              </button>
              <button
                type="button"
                className="approve-button"
                disabled={
                  !storyboard ||
                  storyboard.artifact.status === "approved" ||
                  Boolean(busyAction)
                }
                onClick={handleApproveStoryboard}
              >
                <Check size={18} />
                确认
              </button>
            </div>
          }
        >
          <PromptPreview promptView={storyboard?.promptView} />
          <ArtifactFormEditor
            data={storyboardDraft}
            form={storyboard?.form}
            materialLibrary={materialLibrary}
            emptyLabel="等待 UGC 分镜"
            onChange={setStoryboardDraft}
            fieldErrors={storyboardFieldErrors}
            onFieldChange={(pathName) =>
              setStoryboardFieldErrors((current) =>
                omitKey(current, pathName),
              )
            }
          />
        </StagePanel>

        <StagePanel
          index="3"
          title="视频剧本"
          status={stageStatus.shotPrompt}
          action={
            <div className="button-row">
              <button
                type="button"
                disabled={
                  storyboard?.artifact.status !== "approved" ||
                  Boolean(busyAction)
                }
                onClick={handleCompileShotPrompt}
              >
                <WandSparkles size={18} />
                生成剧本
              </button>
              <button
                type="button"
                className="approve-button"
                disabled={
                  !shotPrompt ||
                  shotPrompt.artifact.status === "approved" ||
                  Boolean(busyAction)
                }
                onClick={handleApproveShotPrompt}
              >
                <Check size={18} />
                确认
              </button>
            </div>
          }
        >
          <PromptPreview promptView={shotPrompt?.promptView} />
          <ArtifactFormEditor
            data={shotPromptDraft}
            form={shotPrompt?.form}
            materialLibrary={materialLibrary}
            emptyLabel="等待视频剧本"
            onChange={(next) =>
              setShotPromptDraft(normalizeShotPromptDraft(next))
            }
            fieldErrors={shotPromptFieldErrors}
            onFieldChange={(pathName) =>
              setShotPromptFieldErrors((current) =>
                omitKey(current, pathName),
              )
            }
          />
        </StagePanel>

        <section className="panel action-panel">
          <div className="section-heading">
            <h2>成片任务</h2>
            <span>{selectedWorkspace?.currentJobId ?? "waiting"}</span>
          </div>
          <button
            type="button"
            disabled={
              shotPrompt?.artifact.status !== "approved" || Boolean(busyAction)
            }
            onClick={handleStartVideo}
          >
            <Play size={18} />
            启动 Seedance
          </button>
        </section>

        <JobProgress
          job={jobDetail?.job}
          nextAction={nextAction}
          runtimeProviderLabel={runtimeProviderLabel}
          workspace={selectedWorkspace}
        />
        <VideoPreview
          finalAsset={jobDetail?.finalAsset}
          videoExport={jobDetail?.videoExport}
          disabled={!selectedWorkspace || Boolean(busyAction)}
          onFeedbackSubmit={handleVideoFeedback}
        />
        {feedbackRoute ? (
          <section className="panel feedback-route-panel">
            <div className="section-heading">
              <h2>反馈路由</h2>
              <span>proposed</span>
            </div>
            <p>{feedbackRoute}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function upsertWorkspace(
  current: CreativeWorkspace[],
  workspace: CreativeWorkspace,
) {
  return [
    workspace,
    ...current.filter((candidate) => candidate.id !== workspace.id),
  ];
}

function workspaceLabel(workspace: CreativeWorkspace) {
  const name = workspace.localPath.split("/").at(-1) ?? workspace.id;
  return `${name} · ${workspace.status}`;
}

function deriveStageStatus(
  workspace: CreativeWorkspace | undefined,
  artifacts: {
    material: WorkspaceArtifactDetail<MaterialIntakeArtifact> | null;
    brief: WorkspaceArtifactDetail<ProductBriefArtifact> | null;
    storyboard: WorkspaceArtifactDetail<StoryboardArtifact> | null;
    shotPrompt: WorkspaceArtifactDetail<ShotPromptArtifact> | null;
  },
) {
  return {
    material:
      artifacts.material?.artifact.status ?? stageFromWorkspace(workspace, 0),
    brief: artifacts.brief?.artifact.status ?? stageFromWorkspace(workspace, 1),
    storyboard:
      artifacts.storyboard?.artifact.status ?? stageFromWorkspace(workspace, 2),
    shotPrompt:
      artifacts.shotPrompt?.artifact.status ?? stageFromWorkspace(workspace, 3),
  };
}

function stageFromWorkspace(
  workspace: CreativeWorkspace | undefined,
  index: 0 | 1 | 2 | 3,
) {
  if (!workspace) {
    return "waiting";
  }
  const order = [
    "materials_ready",
    "brief_approved",
    "storyboard_approved",
    "shotprompt_approved",
  ];
  const statusIndex = order.indexOf(workspace.status);
  return statusIndex >= index ? "approved" : "waiting";
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StagePanel({
  index,
  title,
  status,
  action,
  children,
}: {
  index: string;
  title: string;
  status: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel stage-panel">
      <div className="section-heading">
        <div className="stage-title">
          <span>{index}</span>
          <h2>{title}</h2>
        </div>
        <strong className={`stage-state state-${status}`}>{status}</strong>
      </div>
      <div className="stage-body">{children}</div>
      <div className="stage-actions">{action}</div>
    </section>
  );
}

function EmptyArtifact({ label }: { label: string }) {
  return <div className="empty-artifact">{label}</div>;
}

export function MaterialImportStrip({
  busyAction,
  materialLibrary,
  selectedWorkspace,
  onImportMaterials,
}: {
  busyAction: string | null;
  materialLibrary?: WorkspaceMaterialLibrary;
  selectedWorkspace?: CreativeWorkspace;
  onImportMaterials: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const helperText = selectedWorkspace
    ? materialLibrary
      ? "素材候选将在素材清点卡片中选择"
      : "素材会复制到当前工作目录"
    : "请先选择工作目录";

  return (
    <section className="material-library-strip">
      <div className="material-library-heading">
        <span>当前工作目录素材</span>
        <strong>
          {selectedWorkspace
            ? workspaceLabel(selectedWorkspace)
            : "未选择工作目录"}
        </strong>
      </div>
      <label>
        <span>导入到当前工作目录</span>
        <input
          type="file"
          multiple
          accept="image/*,video/*,.txt,.md"
          disabled={!selectedWorkspace || Boolean(busyAction)}
          onChange={(event) => onImportMaterials(event)}
        />
      </label>
      <div className="upload-summary">
        <Upload size={18} />
        <span>{helperText}</span>
      </div>
    </section>
  );
}

function MaterialSummary({
  artifact,
  promptView,
}: {
  artifact?: WorkspaceMaterialLibrary;
  promptView?: RuntimePromptView;
}) {
  if (!artifact) {
    return <EmptyArtifact label="等待素材清点" />;
  }

  return (
    <div className="artifact-stack">
      <PromptPreview promptView={promptView} />
      <div className="metric-row">
        <StatusPill
          label="primary"
          value={artifact.primaryProductRef ?? "none"}
        />
        <StatusPill label="usable" value={String(artifact.assets.length)} />
        <StatusPill label="rejected" value={String(artifact.rejected.length)} />
      </div>
      <div className="asset-list">
        {artifact.assets.map((asset) => (
          <article className="asset-row" key={asset.ref}>
            <strong>{asset.ref}</strong>
            <span>{asset.role}</span>
            <p>{asset.description}</p>
          </article>
        ))}
      </div>
      {artifact.rejected.length ? (
        <div className="rejected-list">
          {artifact.rejected.map((item) => (
            <p key={item.ref}>
              {item.ref}: {item.reason}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PromptPreview({
  promptView,
}: {
  promptView?: RuntimePromptView;
}) {
  if (!promptView) {
    return null;
  }

  return (
    <section className="prompt-view">
      <div className="prompt-view-heading">
        <h3>{promptView.nl.title}</h3>
        <span>{promptView.promptVersion}</span>
      </div>
      <div className="prompt-section-list">
        {promptView.nl.sections.map((section) => (
          <article className="prompt-section" key={section.id}>
            <strong>{section.label}</strong>
            <p>{section.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MaterialLibraryPreview({
  library,
  selectedRefs,
  onSelectedRefsChange,
}: {
  library?: WorkspaceMaterialLibrary;
  selectedRefs: string[];
  onSelectedRefsChange: (refs: string[]) => void;
}) {
  if (!library) {
    return null;
  }

  function toggleRef(ref: string) {
    const selected = new Set(selectedRefs);
    if (selected.has(ref)) {
      selected.delete(ref);
    } else {
      selected.add(ref);
    }
    onSelectedRefsChange(
      library!.assets
        .filter((asset) => selected.has(asset.ref))
        .map((asset) => asset.ref),
    );
  }

  return (
    <div className="material-library-preview">
      <StatusPill label="usable" value={String(library.assets.length)} />
      <StatusPill label="rejected" value={String(library.rejected.length)} />
      <div className="asset-chip-row">
        {library.assets.map((asset) => (
          <button
            type="button"
            className={`asset-chip ${selectedRefs.includes(asset.ref) ? "selected" : ""}`}
            onClick={() => toggleRef(asset.ref)}
            key={asset.ref}
          >
            {asset.ref}
          </button>
        ))}
      </div>
      {library.rejected.length ? (
        <details className="rejected-materials">
          <summary>{library.rejected.length} 个文件未导入</summary>
          {library.rejected.map((item) => (
            <p key={item.ref}>
              {item.ref}: {item.reason}
            </p>
          ))}
        </details>
      ) : null}
    </div>
  );
}

export function ArtifactFormEditor<TData>({
  data,
  form,
  materialLibrary,
  emptyLabel,
  onChange,
  fieldErrors = {},
  onFieldChange,
}: {
  data: TData | null;
  form?: ArtifactFormContract;
  materialLibrary?: WorkspaceMaterialLibrary;
  emptyLabel: string;
  onChange: (next: TData) => void;
  fieldErrors?: Record<string, string>;
  onFieldChange?: (pathName: string) => void;
}) {
  if (!data) {
    return <EmptyArtifact label={emptyLabel} />;
  }

  const resolvedForm = form ?? inferFormContract(data);
  const scalarFields = resolvedForm.fields.filter(
    (field) => !field.path.includes("[]"),
  );
  const shotFields = resolvedForm.fields.filter((field) =>
    field.path.startsWith("shots[]."),
  );
  const materialRefs = materialLibrary?.assets.map((asset) => asset.ref) ?? [];
  const editableData = data as NonNullable<TData>;
  const shots = Array.isArray(getPath(editableData, "shots"))
    ? (getPath(editableData, "shots") as Array<Record<string, unknown>>)
    : [];

  function setField(pathName: string, value: unknown) {
    const next = setPath(editableData, pathName, value);
    onFieldChange?.(pathName);
    onChange(
      resolvedForm.artifactType === "shotprompt"
        ? (normalizeShotPromptDraft(
            next as unknown as ShotPromptArtifact,
          ) as TData)
        : next,
    );
  }

  return (
    <div className="artifact-form">
      {scalarFields.map((field) =>
        renderArtifactField({
          field,
          pathName: field.path,
          data: editableData,
          materialRefs,
          error: fieldErrors[field.path],
          onChange: setField,
        }),
      )}
      {shotFields.length && shots.length ? (
        <div className="shot-editor-list">
          {shots.map((shot, index) => (
            <article className="shot-editor" key={String(shot.index ?? index)}>
              <div className="shot-editor-heading">
                <strong>Shot {index + 1}</strong>
                <span>{String(shot.purpose ?? "")}</span>
              </div>
              {shotFields.map((field) =>
                renderArtifactField({
                  field,
                  pathName: field.path.replace("shots[]", `shots.${index}`),
                  data: editableData,
                  materialRefs,
                  error:
                    fieldErrors[
                      field.path.replace("shots[]", `shots.${index}`)
                    ],
                  onChange: setField,
                }),
              )}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderArtifactField<TData>({
  field,
  pathName,
  data,
  materialRefs,
  error,
  onChange,
}: {
  field: ArtifactFormField;
  pathName: string;
  data: TData;
  materialRefs: string[];
  error?: string;
  onChange: (pathName: string, value: unknown) => void;
}) {
  const value = getPath(data, pathName);
  const disabled = Boolean(field.readOnly);
  const key = pathName;

  if (field.component === "textarea") {
    return (
      <label className="artifact-field" key={key}>
        <ArtifactFieldLabel field={field} />
        <textarea
          rows={3}
          readOnly={disabled}
          value={String(value ?? "")}
          onChange={(event) => onChange(pathName, event.target.value)}
        />
        <ArtifactFieldError message={error} />
      </label>
    );
  }

  if (field.component === "string_list") {
    return (
      <label className="artifact-field" key={key}>
        <ArtifactFieldLabel field={field} />
        <textarea
          rows={3}
          value={asStringList(value).join("\n")}
          onChange={(event) =>
            onChange(
              pathName,
              event.target.value
                .split(/\r?\n/)
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
        />
        <ArtifactFieldError message={error} />
      </label>
    );
  }

  if (field.component === "nullable_text") {
    return (
      <label className="artifact-field" key={key}>
        <ArtifactFieldLabel field={field} />
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(pathName, event.target.value || null)}
        />
        <ArtifactFieldError message={error} />
      </label>
    );
  }

  if (field.component === "number") {
    return (
      <label className="artifact-field" key={key}>
        <ArtifactFieldLabel field={field} />
        <input
          type="number"
          value={Number(value ?? 0)}
          onChange={(event) => onChange(pathName, Number(event.target.value))}
        />
        <ArtifactFieldError message={error} />
      </label>
    );
  }

  if (field.component === "checkbox") {
    return (
      <label className="artifact-field checkbox-field" key={key}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(pathName, event.target.checked)}
        />
        <ArtifactFieldLabel field={field} />
        <ArtifactFieldError message={error} />
      </label>
    );
  }

  if (field.component === "select" || field.component === "asset_ref_select") {
    const options =
      field.component === "asset_ref_select"
        ? materialRefs
        : (field.options ?? []);
    return (
      <label className="artifact-field" key={key}>
        <ArtifactFieldLabel field={field} />
        <select
          value={String(value ?? "")}
          onChange={(event) => onChange(pathName, event.target.value)}
        >
          {options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
        <ArtifactFieldError message={error} />
      </label>
    );
  }

  if (field.component === "asset_ref_list") {
    const selected = selectedAssetRefs(value);
    return (
      <div className="artifact-field asset-selector" key={key}>
        <ArtifactFieldLabel field={field} />
        <div className="asset-chip-row">
          {materialRefs.map((ref) => (
            <button
              type="button"
              className={`asset-chip ${selected.includes(ref) ? "selected" : ""}`}
              onClick={() => {
                const next = toggleSelectedRef(selected, ref);
                onChange(
                  pathName,
                  Array.isArray(value) && value.some(isBriefAssetRef)
                    ? next.map((item, index) => ({
                        ref: item,
                        useAs: index === 0 ? "primary" : "support",
                      }))
                    : next,
                );
              }}
              key={ref}
            >
              {ref}
            </button>
          ))}
        </div>
        <ArtifactFieldError message={error} />
      </div>
    );
  }

  return (
    <label className="artifact-field" key={key}>
      <ArtifactFieldLabel field={field} />
      <input
        readOnly={disabled}
        value={String(value ?? "")}
        onChange={(event) => onChange(pathName, event.target.value)}
      />
      <ArtifactFieldError message={error} />
    </label>
  );
}

function ArtifactFieldLabel({ field }: { field: ArtifactFormField }) {
  return (
    <span className="artifact-field-label">
      {field.label}
      {field.required ? <span className="required-mark">必填</span> : null}
    </span>
  );
}

function ArtifactFieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function getPath(input: unknown, pathName: string): unknown {
  return pathName.split(".").reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, input);
}

function setPath<TData>(input: TData, pathName: string, value: unknown): TData {
  const output = structuredClone(input) as Record<string, unknown>;
  const segments = pathName.split(".");
  let current: Record<string, unknown> = output;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!next || typeof next !== "object") {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]!] = value;
  return output as TData;
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function isEmptyRequiredValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (typeof value === "number") {
    return Number.isNaN(value);
  }
  if (Array.isArray(value)) {
    return (
      value.length === 0 ||
      value.every((item) => isEmptyRequiredValue(item))
    );
  }
  return false;
}

export function validateArtifactRequiredFields(
  data: unknown,
  form: ArtifactFormContract,
) {
  const errors: Record<string, string> = {};

  for (const field of form.fields) {
    if (!field.required || field.readOnly) {
      continue;
    }

    if (!field.path.includes("[]")) {
      if (isEmptyRequiredValue(getPath(data, field.path))) {
        errors[field.path] = "此项为必填项";
      }
      continue;
    }

    if (!field.path.startsWith("shots[].")) {
      continue;
    }

    const shots = getPath(data, "shots");
    if (!Array.isArray(shots)) {
      errors[field.path] = "此项为必填项";
      continue;
    }

    shots.forEach((_shot, index) => {
      const pathName = field.path.replace("shots[]", `shots.${index}`);
      if (isEmptyRequiredValue(getPath(data, pathName))) {
        errors[pathName] = "此项为必填项";
      }
    });
  }

  return errors;
}

function omitKey(input: Record<string, string>, key: string) {
  if (!(key in input)) {
    return input;
  }
  const { [key]: _removed, ...rest } = input;
  return rest;
}

function isBriefAssetRef(
  value: unknown,
): value is { ref: string; useAs: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { ref?: unknown }).ref === "string",
  );
}

function selectedAssetRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (isBriefAssetRef(item) ? item.ref : String(item)))
    .filter(Boolean);
}

function toggleSelectedRef(selected: string[], ref: string) {
  return selected.includes(ref)
    ? selected.filter((item) => item !== ref)
    : [...selected, ref];
}

function normalizeShotPromptDraft(
  data: ShotPromptArtifact,
): ShotPromptArtifact {
  return {
    ...data,
    shots: data.shots.map((shot) => {
      const { onScreenText: _ignored, ...next } = shot as typeof shot & {
        onScreenText?: unknown;
      };
      return next;
    }),
    tts: {
      ...data.tts,
      source: "shots.voiceover",
      voiceover: data.shots.map((shot) => shot.voiceover.trim()).join(" "),
    },
  };
}

function inferFormContract(data: unknown): ArtifactFormContract {
  if (data && typeof data === "object" && "targetProvider" in data) {
    return {
      artifactType: "shotprompt",
      artifactSchemaVersion: "video-shotprompt.v1",
      fields: [
        { path: "prompt", label: "Seedance 总 Prompt", component: "textarea" },
        { path: "negativePrompt", label: "负向 Prompt", component: "textarea" },
        {
          path: "shots[].providerPrompt",
          label: "镜头 Prompt",
          component: "textarea",
        },
        {
          path: "shots[].referenceAssetRefs",
          label: "参考素材",
          component: "asset_ref_list",
          source: "material.assets",
        },
        { path: "shots[].voiceover", label: "旁白源", component: "textarea" },
        { path: "tts.enabled", label: "启用 TTS", component: "checkbox" },
        {
          path: "tts.voiceover",
          label: "TTS 预览",
          component: "textarea",
          readOnly: true,
        },
      ],
    };
  }

  if (data && typeof data === "object" && "shots" in data) {
    return {
      artifactType: "storyboard",
      artifactSchemaVersion: "ugc-storyboard.v1",
      fields: [
        { path: "narrative", label: "叙事主线", component: "textarea" },
        { path: "totalDurationSec", label: "总时长", component: "number" },
        {
          path: "shots[].purpose",
          label: "镜头目的",
          component: "select",
          options: ["hook", "benefit", "proof", "cta"],
        },
        { path: "shots[].durationSec", label: "镜头时长", component: "number" },
        { path: "shots[].scene", label: "场景", component: "textarea" },
        {
          path: "shots[].visualDirection",
          label: "画面方向",
          component: "textarea",
        },
        {
          path: "shots[].productAssetRef",
          label: "素材引用",
          component: "asset_ref_select",
          source: "material.assets",
        },
        { path: "shots[].voiceover", label: "旁白", component: "textarea" },
        { path: "shots[].transition", label: "转场", component: "text" },
      ],
    };
  }

  return {
    artifactType: "brief",
    artifactSchemaVersion: "product-brief.v1",
    fields: [
      { path: "product.name", label: "商品名称", component: "text" },
      { path: "product.category", label: "商品类目", component: "text" },
      { path: "product.keyFacts", label: "关键事实", component: "string_list" },
      {
        path: "product.assets",
        label: "产品素材",
        component: "asset_ref_list",
        source: "material.assets",
      },
      { path: "audience.who", label: "目标人群", component: "text" },
      {
        path: "audience.painOrDesire",
        label: "痛点/欲望",
        component: "textarea",
      },
      { path: "coreSellingPoint", label: "核心卖点", component: "textarea" },
      { path: "proof", label: "证明点", component: "string_list" },
      { path: "brandTone", label: "品牌语气", component: "text" },
    ],
  };
}
