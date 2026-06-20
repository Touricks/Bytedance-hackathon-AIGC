import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Clock3,
  Film,
  FolderOpen,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import {
  createWorkspace,
  deleteWorkspace,
  initializeWorkspace,
  listWorkspaces,
  selectWorkspaceDirectory,
  updateWorkspaceDisplayName,
} from "../lib/api/client.js";
import { getConfigLimits } from "../lib/api/configLimits.js";
import type { DiscoveredWorkspace } from "../lib/api/client.js";
import type { CreativeWorkspace } from "@aigc-video/shared";
import {
  navigateToDataDashboard,
  navigateToWorkspace,
} from "./routeState.js";

const pipelineStages = [
  "创作要求",
  "素材解读",
  "商品卖点",
  "分镜规划",
  "生成要求",
  "应用分镜",
  "分镜图",
  "分镜视频",
  "成片",
];

const statusStageIndex: Record<CreativeWorkspace["status"], number> = {
  draft: 0,
  materials_ready: 1,
  brief_proposed: 2,
  brief_approved: 2,
  storyboard_proposed: 3,
  storyboard_approved: 3,
  shotprompt_proposed: 4,
  shotprompt_approved: 5,
  video_generating: 7,
  video_ready: 8,
  failed: 0,
  missing: 0,
};

const completedStageCount: Record<CreativeWorkspace["status"], number> = {
  draft: 0,
  materials_ready: 2,
  brief_proposed: 2,
  brief_approved: 3,
  storyboard_proposed: 3,
  storyboard_approved: 4,
  shotprompt_proposed: 4,
  shotprompt_approved: 5,
  video_generating: 7,
  video_ready: 8,
  failed: 0,
  missing: 0,
};

const statusLabel: Record<CreativeWorkspace["status"], string> = {
  draft: "待提交创作要求",
  materials_ready: "素材已就绪",
  brief_proposed: "卖点待审",
  brief_approved: "卖点已生效",
  storyboard_proposed: "分镜待审",
  storyboard_approved: "分镜已生效",
  shotprompt_proposed: "生成要求待审",
  shotprompt_approved: "可应用分镜",
  video_generating: "视频生成中",
  video_ready: "可生成成片",
  failed: "处理失败",
  missing: "需要恢复",
};

function openWorkspace(id: string) {
  navigateToWorkspace(id);
}

function workspaceName(workspace: CreativeWorkspace) {
  const displayName = workspace.displayName?.trim();
  if (displayName) return displayName;
  if (!workspace.localPath) {
    return workspace.id;
  }
  const parts = workspace.localPath.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? workspace.localPath;
}

function workspaceLocationLabel(workspace: CreativeWorkspace) {
  return workspace.localPath || "云端创作工作区";
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusTone(status: CreativeWorkspace["status"]) {
  if (status === "failed") return "failed";
  if (status === "video_generating") return "running";
  if (
    status === "brief_proposed" ||
    status === "storyboard_proposed" ||
    status === "shotprompt_proposed"
  ) {
    return "proposed";
  }
  if (
    status === "brief_approved" ||
    status === "storyboard_approved" ||
    status === "shotprompt_approved" ||
    status === "video_ready"
  ) {
    return "approved";
  }
  if (status === "missing") return "changed";
  return "idle";
}

function WorkspaceCard({
  workspace,
  isCurrent,
  onOpen,
  onDelete,
  onRename,
  isDeleting,
  isRenaming,
}: {
  workspace: CreativeWorkspace;
  isCurrent: boolean;
  onOpen: (id: string) => void;
  onDelete: (workspace: CreativeWorkspace) => void;
  onRename: (workspace: CreativeWorkspace) => void;
  isDeleting: boolean;
  isRenaming: boolean;
}) {
  const stageIndex = statusStageIndex[workspace.status] ?? 0;
  const doneCount = completedStageCount[workspace.status] ?? 0;
  const progress = Math.round((doneCount / pipelineStages.length) * 100);
  const gradientSeed = Math.abs(
    Array.from(workspace.id).reduce(
      (total, char) => total + char.charCodeAt(0),
      0,
    ),
  );
  const coverClass = `ws-card__cover ws-card__cover--${(gradientSeed % 5) + 1}`;

  return (
    <article className="card fade ws-card">
      <button
        type="button"
        className="ws-card__open"
        onClick={() => onOpen(workspace.id)}
      >
        <div className={coverClass}>
          {isCurrent ? (
            <span className="pill ws-card__current">
              <span className="dot" />
              当前
            </span>
          ) : null}
          <span className={`pill pill--${statusTone(workspace.status)}`}>
            <span className="dot" />
            {statusLabel[workspace.status]}
          </span>
          <div className="ws-card__bottle" aria-hidden="true" />
        </div>
        <div className="ws-card__body">
          <div className="ws-card__title u-clip">{workspaceName(workspace)}</div>
          <div className="ws-card__path u-clip">{workspaceLocationLabel(workspace)}</div>
          <div className="ws-card__progress" aria-hidden="true">
            {pipelineStages.map((stage, index) => (
              <span
                key={stage}
                title={stage}
                className={
                  index < doneCount
                    ? "is-on"
                    : index === stageIndex
                      ? "is-current"
                      : undefined
                }
              />
            ))}
          </div>
          <div className="ws-card__meta">
            <span>
              <Clock3 size={13} />
              {formatUpdatedAt(workspace.lastSeenAt ?? workspace.updatedAt)}
            </span>
            <strong className="mono tnum">{progress}%</strong>
          </div>
        </div>
      </button>
      <button
        type="button"
        className="ws-card__rename"
        title="重命名工作区"
        aria-label={`重命名工作区 ${workspaceName(workspace)}`}
        onClick={() => onRename(workspace)}
        disabled={isRenaming || isDeleting}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className="ws-card__delete"
        title="删除工作区"
        aria-label={`删除工作区 ${workspaceName(workspace)}`}
        onClick={() => onDelete(workspace)}
        disabled={isDeleting}
      >
        <Trash2 size={14} />
      </button>
    </article>
  );
}

export function App() {
  const [workspaces, setWorkspaces] = useState<CreativeWorkspace[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(
    null,
  );
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [directory, setDirectory] = useState("");
  const [query, setQuery] = useState("");
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const [workspaceStorageKind, setWorkspaceStorageKind] = useState<"local" | "s3">(
    "local",
  );
  const isCloudWorkspaceMode = workspaceStorageKind === "s3";
  const latestWorkspace = [...workspaces].sort(
    (a, b) =>
      new Date(b.lastSeenAt ?? b.updatedAt).getTime() -
      new Date(a.lastSeenAt ?? a.updatedAt).getTime(),
  )[0];

  const filteredWorkspaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((workspace) =>
      `${workspaceName(workspace)} ${workspaceLocationLabel(workspace)} ${workspace.status}`
        .toLowerCase()
        .includes(q),
    );
  }, [query, workspaces]);

  const filteredDiscovered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return discovered;
    return discovered.filter((item) =>
      `${item.localPath} ${item.workspaceId ?? ""}`.toLowerCase().includes(q),
    );
  }, [discovered, query]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, limits] = await Promise.all([
        listWorkspaces(),
        getConfigLimits(),
      ]);
      setWorkspaceStorageKind(limits.data.workspaceStorageKind ?? "local");
      setWorkspaces(result.workspaces);
      setDiscovered(result.discovered ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const applyWorkspaceNameDraft = async (workspaceId: string) => {
    const displayName = workspaceNameDraft.trim();
    if (!displayName) return;
    await updateWorkspaceDisplayName({ workspaceId, displayName });
    setWorkspaceNameDraft("");
  };

  const openDirectory = async (path: string) => {
    setError(null);
    try {
      const detail = await initializeWorkspace(path);
      await applyWorkspaceNameDraft(detail.workspace.id);
      openWorkspace(detail.workspace.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onChooseDirectory = async () => {
    setError(null);
    try {
      const picked = await selectWorkspaceDirectory();
      if (picked.directory) {
        const detail = await initializeWorkspace(picked.directory);
        openWorkspace(detail.workspace.id);
        return;
      }
      if (picked.cancelled) return;
      setError("当前环境不支持系统目录选择，请输入工作目录路径。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onOpenDirectory = async () => {
    const trimmed = directory.trim();
    if (!trimmed) {
      setError("请输入工作目录路径。");
      return;
    }
    await openDirectory(trimmed);
  };

  const onCreateManaged = async () => {
    if (isCloudWorkspaceMode) {
      setError(null);
      try {
        const detail = await createWorkspace(workspaceNameDraft.trim() || undefined);
        setWorkspaceNameDraft("");
        openWorkspace(detail.workspace.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    await onChooseDirectory();
  };

  const onDeleteWorkspace = async (workspace: CreativeWorkspace) => {
    const confirmed = window.confirm(
      isCloudWorkspaceMode || !workspace.localPath
        ? `删除工作区「${workspaceName(workspace)}」会清理云端创作素材、生成结果和数据库记录。`
        : `删除工作区「${workspaceName(workspace)}」会移除本地 .daireel 创作数据，并从列表中移除；不会删除工作目录中的其他文件。`,
    );
    if (!confirmed) return;

    setError(null);
    setDeletingWorkspaceId(workspace.id);
    try {
      await deleteWorkspace(workspace.id);
      setWorkspaces((current) =>
        current.filter((item) => item.id !== workspace.id),
      );
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  const onRenameWorkspace = async (workspace: CreativeWorkspace) => {
    const nextName = window.prompt("工作区名称", workspace.displayName ?? workspaceName(workspace));
    if (nextName === null) return;

    setError(null);
    setRenamingWorkspaceId(workspace.id);
    try {
      const result = await updateWorkspaceDisplayName({
        workspaceId: workspace.id,
        displayName: nextName.trim() || null,
      });
      setWorkspaces((current) =>
        current.map((item) =>
          item.id === workspace.id ? result.workspace : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenamingWorkspaceId(null);
    }
  };

  return (
    <div className="workspaces-landing on-light">
      <header className="home-topbar">
        <div className="home-logo" aria-label="Daireel">
          <span>
            <Film size={15} />
          </span>
          <strong>Daireel</strong>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--lg home-topbar__dashboard"
          onClick={() => navigateToDataDashboard()}
          title="进入数据面板"
          aria-label="进入数据面板"
        >
          <BarChart3 size={16} />
          进入数据面板
        </button>
        <div className="home-topbar__search">
          <Search size={15} />
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索工作区..."
            aria-label="搜索工作区"
          />
        </div>
      </header>

      <main>
        <section className="home-hero fade" aria-labelledby="home-title">
          <div>
            <span className="eyebrow">AIGC 带货短视频工作台</span>
            <h1 id="home-title">创作工作区</h1>
            <p>
              上传商品素材，经模块化 AI 链路逐步审核并生效创作产物，逐分镜出片后拼接成片。
            </p>
          </div>
          <div className="home-hero__actions">
            <label className="workspaces-landing__name-field">
              <span>工作区名称</span>
              <input
                className="field"
                value={workspaceNameDraft}
                onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                placeholder="例如：浴室清洁布投放测试"
                maxLength={80}
              />
            </label>
            <button
              type="button"
              className="btn btn--lg btn--primary workspaces-landing__primary"
              onClick={onCreateManaged}
              disabled={loading}
            >
              <Plus size={18} />
              新建工作区
            </button>
            {latestWorkspace ? (
              <button
                type="button"
                className="btn btn--lg btn--quiet workspaces-landing__secondary"
                onClick={() => openWorkspace(latestWorkspace.id)}
              >
                <RotateCcw size={16} />
                继续最近会话
                <ArrowRight size={16} />
              </button>
            ) : null}
          </div>
        </section>

        {error ? <p className="error">{error}</p> : null}

        {!isCloudWorkspaceMode ? (
          <form
            className="workspaces-landing__directory-form card"
            onSubmit={(event) => {
              event.preventDefault();
              void onOpenDirectory();
            }}
          >
            <label>
              工作目录路径
              <input
                className="field"
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
                placeholder="输入工作目录的绝对路径，例如 .../Project-AIGC/my-draft"
              />
            </label>
            <div className="workspaces-landing__form-actions">
              <button type="button" className="btn" onClick={onChooseDirectory}>
                <FolderOpen size={16} />
                选择
              </button>
              <button type="submit" className="btn btn--primary">
                打开
              </button>
            </div>
          </form>
        ) : null}

        <div className="home-section-title">
          <FolderOpen size={16} />
          <h2>已登记工作区</h2>
          <span className="pill pill--idle">{filteredWorkspaces.length}</span>
        </div>
        {loading ? (
          <p className="home-empty">加载中...</p>
        ) : filteredWorkspaces.length === 0 ? (
          <p className="home-empty">暂无托管工作区。</p>
        ) : (
          <ul className="workspaces-list" aria-label="已登记工作区">
            {filteredWorkspaces.map((workspace) => (
              <li key={workspace.id}>
                <WorkspaceCard
                  workspace={workspace}
                  isCurrent={workspace.id === latestWorkspace?.id}
                  onOpen={openWorkspace}
                  onDelete={onDeleteWorkspace}
                  onRename={onRenameWorkspace}
                  isDeleting={deletingWorkspaceId === workspace.id}
                  isRenaming={renamingWorkspaceId === workspace.id}
                />
              </li>
            ))}
          </ul>
        )}

        {!isCloudWorkspaceMode && filteredDiscovered.length > 0 ? (
          <section className="workspaces-discovered card" aria-label="本地草稿">
            <div className="home-section-title">
              <FolderOpen size={16} />
              <h2>本地草稿 · 未登记</h2>
              <span className="pill pill--idle">{filteredDiscovered.length}</span>
            </div>
            <p>
              磁盘上发现了 .daireel 工作区，但未登记到数据库。点击可重新打开并复用原工作区 id。
            </p>
            <ul className="workspaces-list workspaces-list--drafts">
              {filteredDiscovered.map((item) => (
                <li key={item.localPath}>
                  <button
                    type="button"
                    className="discovered-row"
                    onClick={() => openDirectory(item.localPath)}
                  >
                    <span>
                      <FolderOpen size={17} />
                    </span>
                    <div>
                      <strong className="mono u-clip">{item.localPath}</strong>
                      <small className="u-clip">
                        {item.workspaceId ? `原工作区 ${item.workspaceId}` : "等待重新登记"}
                      </small>
                    </div>
                    <Link2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
