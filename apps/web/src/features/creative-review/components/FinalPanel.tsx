import { useEffect, useState, type FormEvent } from "react";
import { BarChart3, Download, Play, UploadCloud } from "lucide-react";
import { toAbsoluteAssetUrl } from "../../../lib/api/client.js";
import {
  importDashboardVideoArtifact,
  listDashboardVideoArtifacts,
} from "../../../lib/api/dashboardVideoArtifacts.js";
import { finalVideoDownloadUrl } from "../../../lib/api/finalVideo.js";
import { navigateToDataDashboard } from "../../../routes/routeState.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { statusTone } from "../reviewFlow.js";
import { OneClickProgress } from "./OneClickProgress.js";

export async function importFinalVideoToDashboard(
  input: {
    workspaceId: string;
    finalVideoJobId: string;
    name: string;
  },
  deps = {
    importDashboardVideoArtifact,
    listDashboardVideoArtifacts,
    navigateToDataDashboard,
  },
) {
  const existingVideos = await deps.listDashboardVideoArtifacts(input.workspaceId);
  const existingVideo = existingVideos.data.find(
    (video) => video.finalVideoJobId === input.finalVideoJobId,
  );
  if (existingVideo) {
    deps.navigateToDataDashboard(
      input.workspaceId,
      "diagnosis",
      input.finalVideoJobId,
      existingVideo.id,
    );
    return { status: "already-exists" as const, data: existingVideo };
  }

  const created = await deps.importDashboardVideoArtifact(input.workspaceId, {
    finalVideoJobId: input.finalVideoJobId,
    name: input.name,
  });
  deps.navigateToDataDashboard(
    input.workspaceId,
    "diagnosis",
    input.finalVideoJobId,
    created.data.id,
  );
  return { status: "imported" as const, data: created.data };
}

export function FinalPanel({ vm }: { vm: WorkbenchViewModel }) {
  const job = vm.finalVideo;
  const oneClickJob = vm.oneClickFinalVideo;
  const oneClickShotCount = vm.workflow?.shots?.length ?? 0;
  const finalUrl = job?.localUrl ? toAbsoluteAssetUrl(job.localUrl) : null;
  const downloadUrl = finalUrl ? finalVideoDownloadUrl(finalUrl) : null;
  const defaultImportName = job?.id ? `final-video-${job.id}` : "";
  const [importName, setImportName] = useState(defaultImportName);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    setImportName(defaultImportName);
    setImportMessage(null);
  }, [defaultImportName]);

  async function openDashboard(name: string) {
    if (!job?.id || !finalUrl) return;
    setImportMessage(null);
    setIsImporting(true);
    try {
      const result = await importFinalVideoToDashboard({
        workspaceId: vm.workspaceId,
        finalVideoJobId: job.id,
        name,
      });
      setImportMessage(
        result.status === "already-exists"
          ? "该成片已在数据面板，正在打开对应诊断看板"
          : "已导入数据面板，正在打开诊断看板",
      );
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "打开数据面板失败");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleImportDashboard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importName.trim()) return;
    await openDashboard(importName.trim());
  }

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <h1>生成成片</h1>
      </div>
      {oneClickJob ? (
        <OneClickProgress
          job={oneClickJob}
          shotCount={oneClickShotCount}
          description="全自动一键成片任务会在完成后接入这里的成片结果。"
        />
      ) : null}
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={
            vm.busy ||
            Boolean(vm.pending?.finalVideo) ||
            !vm.workflow?.canComposeFinalVideo
          }
          onClick={vm.actions.composeFinal}
        >
          <Play size={16} />
          {vm.pending?.finalVideo ? "正在生成成片..." : "生成成片"}
        </button>
        <button
          type="button"
          className="review-secondary"
          disabled={!finalUrl || isImporting}
          title={
            finalUrl
              ? "导入成片并打开诊断数据面板"
              : "成片生成完成后即可进入数据面板"
          }
          onClick={() => void openDashboard(importName.trim() || defaultImportName)}
        >
          <BarChart3 size={16} />
          分析诊断
        </button>
      </div>
      {job ? (
        <div className="review-final">
          <span className={`review-status review-status--${statusTone(job.status)}`}>
            {job.status}
          </span>
          {finalUrl ? (
            <>
              <video src={finalUrl} controls />
              <a
                className="download-link"
                href={downloadUrl ?? finalUrl}
                download={`final-video-${job.id}.mp4`}
              >
                <Download size={14} />
                下载 MP4
              </a>
              <form className="review-final-import" onSubmit={handleImportDashboard}>
                <label>
                  <span>成片名称</span>
                  <input
                    value={importName}
                    onChange={(event) => setImportName(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="review-secondary"
                  disabled={isImporting || !importName.trim()}
                >
                  <UploadCloud size={14} />
                  {isImporting ? "正在导入..." : "导入数据面板"}
                </button>
                {importMessage ? <p>{importMessage}</p> : null}
              </form>
            </>
          ) : (
            <p className="review-muted">成片任务仍在处理中。</p>
          )}
          {job.errorMessage ? <p className="review-error">{job.errorMessage}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
