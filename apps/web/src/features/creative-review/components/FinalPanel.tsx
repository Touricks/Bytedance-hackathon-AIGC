import { useEffect, useState, type FormEvent } from "react";
import { Download, Play, UploadCloud } from "lucide-react";
import { toAbsoluteAssetUrl } from "../../../lib/api/client.js";
import { importDashboardVideoArtifact } from "../../../lib/api/dashboardVideoArtifacts.js";
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
    navigateToDataDashboard,
  },
) {
  await deps.importDashboardVideoArtifact(input.workspaceId, {
    finalVideoJobId: input.finalVideoJobId,
    name: input.name,
  });
  deps.navigateToDataDashboard(undefined, "videos");
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

  async function handleImportDashboard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!job?.id || !finalUrl || !importName.trim()) return;
    setImportMessage(null);
    setIsImporting(true);
    try {
      await importFinalVideoToDashboard({
        workspaceId: vm.workspaceId,
        finalVideoJobId: job.id,
        name: importName.trim(),
      });
      setImportMessage("已导入数据面板");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入数据面板失败");
    } finally {
      setIsImporting(false);
    }
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
