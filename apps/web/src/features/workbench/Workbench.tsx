import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Film,
  Image as ImageIcon,
  Layers3,
  Play,
  RefreshCw,
  Upload,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  toAbsoluteAssetUrl,
  toWorkspaceMaterialUrl,
} from "../../lib/api/client.js";
import type { WorkbenchViewModel } from "./useWorkbenchViewModel.js";
import { useWorkbenchViewModel } from "./useWorkbenchViewModel.js";

function backToWorkspaces() {
  window.history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function shortId(value: string | null | undefined) {
  if (!value) return "none";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function jsonPreview(value: unknown) {
  if (!value) return "No artifact yet.";
  return JSON.stringify(value, null, 2);
}

function stageState(
  artifact: { status: string } | null,
  emptyLabel = "waiting",
) {
  return artifact?.status ?? emptyLabel;
}

function statusTone(status: string | null | undefined) {
  if (!status) return "muted";
  if (status.includes("FAILED") || status === "failed") return "danger";
  if (
    status.includes("SELECTED") ||
    status === "approved" ||
    status === "SUCCEEDED"
  ) {
    return "good";
  }
  if (
    status.includes("GENERATING") ||
    status.includes("PROPOSING") ||
    status === "PENDING" ||
    status === "RUNNING"
  ) {
    return "busy";
  }
  if (status.includes("READY") || status === "proposed" || status === "PARTIAL") {
    return "warn";
  }
  return "muted";
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <span className={`workbench-pill workbench-pill--${statusTone(value)}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function StageHeader({
  index,
  title,
  state,
}: {
  index: number;
  title: string;
  state: string;
}) {
  return (
    <div className="workbench-stage__header">
      <span className="workbench-stage__index">{index}</span>
      <h3>{title}</h3>
      <span className={`workbench-state workbench-state--${statusTone(state)}`}>
        {state}
      </span>
    </div>
  );
}

function PipelineStage({
  children,
  index,
  state,
  title,
}: {
  children: ReactNode;
  index: number;
  state: string;
  title: string;
}) {
  return (
    <section className="workbench-stage">
      <StageHeader index={index} title={title} state={state} />
      {children}
    </section>
  );
}

function PipelinePanel({ vm }: { vm: WorkbenchViewModel }) {
  const materialAssets = vm.materialLibrary?.assets ?? [];
  const aspectRatios = ["9:16", "16:9", "1:1"] as const;

  return (
    <section className="workbench-panel workbench-panel--pipeline">
      <div className="workbench-panel__title">
        <Layers3 size={18} />
        <div>
          <h2>Artifact Pipeline</h2>
          <p>Module artifacts, shot set apply, then shot production.</p>
        </div>
      </div>

      <PipelineStage
        index={1}
        title="Materials"
        state={stageState(vm.artifacts.material)}
      >
        <label className="workbench-upload">
          <Upload size={16} />
          <span>Upload material</span>
          <input
            type="file"
            accept="image/*,video/*,.txt,.md"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) vm.actions.uploadMaterial(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <label>
          Material note
          <textarea
            rows={3}
            value={vm.inputs.materialPrompt}
            onChange={(event) => vm.inputs.setMaterialPrompt(event.target.value)}
            placeholder="Optional intake hint"
          />
        </label>
        <button
          type="button"
          onClick={vm.actions.runMaterialIntake}
          disabled={vm.busy}
        >
          <Wand2 size={16} />
          Run intake
        </button>
        <button
          type="button"
          className="workbench-button--quiet"
          onClick={vm.actions.approveMaterialIntake}
          disabled={vm.busy || !vm.artifacts.material}
        >
          <CheckCircle2 size={16} />
          Approve
        </button>
        <div className="workbench-material-grid">
          {materialAssets.slice(0, 6).map((asset) => (
            <div key={asset.ref} className="workbench-material">
              {asset.kind === "image" ? (
                <img
                  src={toWorkspaceMaterialUrl(vm.workspaceId, asset.ref)}
                  alt={asset.description}
                />
              ) : (
                <FileText size={18} />
              )}
              <span>{asset.description}</span>
            </div>
          ))}
        </div>
      </PipelineStage>

      <PipelineStage
        index={2}
        title="Brief"
        state={stageState(vm.artifacts.brief)}
      >
        <label>
          Direction
          <textarea
            rows={3}
            value={vm.inputs.briefDirection}
            onChange={(event) => vm.inputs.setBriefDirection(event.target.value)}
            placeholder="Optional brief direction"
          />
        </label>
        <div className="workbench-actions">
          <button type="button" onClick={vm.actions.proposeBrief} disabled={vm.busy}>
            <Wand2 size={16} />
            Propose
          </button>
          <button
            type="button"
            className="workbench-button--quiet"
            onClick={vm.actions.approveBrief}
            disabled={vm.busy || !vm.artifacts.brief}
          >
            <CheckCircle2 size={16} />
            Approve
          </button>
        </div>
      </PipelineStage>

      <PipelineStage
        index={3}
        title="Storyboard"
        state={stageState(vm.artifacts.storyboard)}
      >
        <div className="workbench-actions">
          <button
            type="button"
            onClick={vm.actions.proposeStoryboard}
            disabled={vm.busy}
          >
            <Wand2 size={16} />
            Propose
          </button>
          <button
            type="button"
            className="workbench-button--quiet"
            onClick={vm.actions.approveStoryboard}
            disabled={vm.busy || !vm.artifacts.storyboard}
          >
            <CheckCircle2 size={16} />
            Approve
          </button>
        </div>
      </PipelineStage>

      <PipelineStage
        index={4}
        title="Shotprompt"
        state={stageState(vm.artifacts.shotPrompt)}
      >
        <label>
          Aspect ratio
          <select
            value={vm.inputs.aspectRatio}
            onChange={(event) =>
              vm.inputs.setAspectRatio(
                event.target.value as (typeof aspectRatios)[number],
              )
            }
          >
            {aspectRatios.map((ratio) => (
              <option key={ratio}>{ratio}</option>
            ))}
          </select>
        </label>
        <div className="workbench-actions">
          <button
            type="button"
            onClick={vm.actions.compileShotPrompt}
            disabled={vm.busy}
          >
            <Wand2 size={16} />
            Propose
          </button>
          <button
            type="button"
            className="workbench-button--quiet"
            onClick={vm.actions.approveShotPrompt}
            disabled={vm.busy || !vm.artifacts.shotPrompt}
          >
            <CheckCircle2 size={16} />
            Approve
          </button>
          <button
            type="button"
            className="workbench-button--quiet"
            onClick={vm.actions.applyShotSet}
            disabled={vm.busy || !vm.artifacts.shotPrompt}
          >
            <Play size={16} />
            Apply
          </button>
        </div>
      </PipelineStage>
    </section>
  );
}

function ArtifactPanel({ vm }: { vm: WorkbenchViewModel }) {
  const active =
    vm.artifacts.shotPrompt ??
    vm.artifacts.storyboard ??
    vm.artifacts.brief ??
    vm.artifacts.material;
  return (
    <section className="workbench-panel workbench-panel--artifact">
      <div className="workbench-panel__title">
        <FileText size={18} />
        <div>
          <h2>Latest Artifact</h2>
          <p>
            {active
              ? `${active.moduleId ?? active.type} · ${active.status}`
              : "No artifact"}
          </p>
        </div>
      </div>
      <pre className="workbench-json">{jsonPreview(active?.data)}</pre>
    </section>
  );
}

function ShotSelector({ vm }: { vm: WorkbenchViewModel }) {
  if (vm.shots.length === 0) {
    return (
      <div className="workbench-empty">
        Apply the approved shotprompt to create the active shot set.
      </div>
    );
  }
  return (
    <div className="workbench-shot-list">
      {vm.shots.map((shot) => (
        <button
          key={shot.shotId}
          type="button"
          className={
            shot.shotId === vm.selectedShotId
              ? "workbench-shot workbench-shot--active"
              : "workbench-shot"
          }
          onClick={() => vm.actions.setSelectedShotId(shot.shotId)}
        >
          <span>{shot.orderIndex + 1}</span>
          <strong>{shot.status}</strong>
        </button>
      ))}
    </div>
  );
}

function ImageRounds({ vm }: { vm: WorkbenchViewModel }) {
  const round = vm.latestImageRound;
  const batchId = round?.batch?.id;

  if (!round || !batchId) {
    return <div className="workbench-empty">No image round yet.</div>;
  }

  return (
    <div className="workbench-round">
      <div className="workbench-round__meta">
        <ImageIcon size={16} />
        <span>{round.batch?.status}</span>
        <span>
          {round.batch?.succeededCount}/{round.batch?.requestedCount}
        </span>
      </div>
      <div className="workbench-candidates">
        {round.candidates.map((candidate) => (
          <button
            type="button"
            key={candidate.id}
            className={`workbench-candidate workbench-candidate--${statusTone(
              candidate.status,
            )}`}
            disabled={candidate.status !== "SUCCEEDED"}
            onClick={() => vm.actions.selectImageCandidate(candidate.id, batchId)}
          >
            {candidate.imageUrl ? (
              <img src={toAbsoluteAssetUrl(candidate.imageUrl)} alt={candidate.id} />
            ) : (
              <span>{candidate.errorMessage ?? candidate.status}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function VideoRounds({ vm }: { vm: WorkbenchViewModel }) {
  const round = vm.latestVideoRound;
  const batchId = round?.batch?.id;

  if (!round || !batchId) {
    return <div className="workbench-empty">No video round yet.</div>;
  }

  return (
    <div className="workbench-round">
      <div className="workbench-round__meta">
        <Film size={16} />
        <span>{round.batch?.status}</span>
        <span>
          {round.batch?.succeededCount}/{round.batch?.requestedCount}
        </span>
      </div>
      <div className="workbench-candidates workbench-candidates--video">
        {round.candidates.map((candidate) => (
          <div
            key={candidate.id}
            className={`workbench-video-candidate workbench-candidate--${statusTone(
              candidate.status,
            )}`}
          >
            {candidate.videoUrl ? (
              <video
                src={toAbsoluteAssetUrl(candidate.videoUrl)}
                controls
                preload="metadata"
              />
            ) : (
              <span>{candidate.errorMessage ?? candidate.status}</span>
            )}
            <button
              type="button"
              disabled={candidate.status !== "SUCCEEDED"}
              onClick={() => vm.actions.selectVideoCandidate(candidate.id, batchId)}
            >
              Select video
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShotPanel({ vm }: { vm: WorkbenchViewModel }) {
  const shot = vm.selectedWorkflowShot;
  const allImagesSelected =
    vm.shots.length > 0 && vm.shots.every((row) => Boolean(row.selectedImageId));

  return (
    <section className="workbench-panel workbench-panel--shots">
      <div className="workbench-panel__title">
        <ImageIcon size={18} />
        <div>
          <h2>Shot Workbench</h2>
          <p>
            {shot
              ? `Shot ${shot.orderIndex + 1} · ${shortId(shot.shotId)}`
              : "No shot selected"}
          </p>
        </div>
      </div>
      <ShotSelector vm={vm} />
      {shot ? (
        <>
          <div className="workbench-shot-summary">
            <StatusPill label="Status" value={shot.status} />
            <StatusPill label="Image batch" value={shortId(shot.activeImageBatchId)} />
            <StatusPill label="Video batch" value={shortId(shot.activeVideoBatchId)} />
          </div>
          <label>
            Shot direction
            <textarea
              rows={3}
              value={vm.inputs.shotDirection}
              onChange={(event) => vm.inputs.setShotDirection(event.target.value)}
              placeholder="Optional prompt/script direction"
            />
          </label>
          <div className="workbench-command-grid">
            <button
              type="button"
              onClick={vm.actions.proposeImage}
              disabled={vm.busy || !vm.selectedShotId}
            >
              <ImageIcon size={16} />
              Image propose
            </button>
            <button
              type="button"
              className="workbench-button--quiet"
              onClick={vm.actions.retryImage}
              disabled={vm.busy || !shot.activeImagePromptArtifactId}
            >
              <RefreshCw size={16} />
              Retry image
            </button>
            <button
              type="button"
              onClick={vm.actions.proposeVideo}
              disabled={vm.busy || !shot.selectedImageId || !allImagesSelected}
              title={
                allImagesSelected
                  ? "Generate video candidates"
                  : "All shots need selected images before video propose"
              }
            >
              <Film size={16} />
              Video propose
            </button>
            <button
              type="button"
              className="workbench-button--quiet"
              onClick={vm.actions.retryVideo}
              disabled={vm.busy || !shot.activeVideoScriptArtifactId}
            >
              <RefreshCw size={16} />
              Retry video
            </button>
          </div>
          <div className="workbench-rounds">
            <ImageRounds vm={vm} />
            <VideoRounds vm={vm} />
          </div>
        </>
      ) : null}
    </section>
  );
}

function FinalAndTracePanel({ vm }: { vm: WorkbenchViewModel }) {
  const job = vm.finalVideo;
  return (
    <section className="workbench-panel workbench-panel--right">
      <div className="workbench-panel__title">
        <Play size={18} />
        <div>
          <h2>Final Compose</h2>
          <p>{vm.workflow?.canComposeFinalVideo ? "Ready" : "Waiting for videos"}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={vm.actions.composeFinal}
        disabled={vm.busy || !vm.workflow?.canComposeFinalVideo}
      >
        <Play size={16} />
        Compose final
      </button>
      {job ? (
        <div className="workbench-final">
          <StatusPill label="Final status" value={job.status} />
          {job.localUrl ? (
            <video src={toAbsoluteAssetUrl(job.localUrl)} controls />
          ) : (
            <div className="workbench-empty">Final video is not ready.</div>
          )}
          {job.errorMessage ? (
            <p className="workbench-error">{job.errorMessage}</p>
          ) : null}
        </div>
      ) : null}

      <div className="workbench-trace">
        <div className="workbench-subtitle">
          <Clock3 size={16} />
          Recent trace
        </div>
        {vm.traces.length === 0 ? (
          <div className="workbench-empty">No trace events.</div>
        ) : (
          vm.traces.map((trace) => (
            <div key={trace.id} className="workbench-trace-row">
              <span>{trace.traceType}</span>
              <strong>{trace.name}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function Workbench({ workspaceId }: { workspaceId: string }) {
  const vm = useWorkbenchViewModel(workspaceId);

  return (
    <div className="workbench">
      <header className="workbench-header">
        <button
          type="button"
          className="workbench-icon-button"
          onClick={backToWorkspaces}
          title="Back to workspaces"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="workbench-header__title">
          <span>Workspace</span>
          <h1>{vm.workspace?.localPath ?? vm.workspaceId}</h1>
        </div>
        <div className="workbench-header__metrics">
          <StatusPill label="API status" value={vm.workspace?.status ?? "loading"} />
          <StatusPill label="Shots" value={String(vm.shots.length)} />
          <button
            type="button"
            className="workbench-icon-button"
            onClick={() => void vm.actions.refresh()}
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {vm.error ? <div className="workbench-error">{vm.error}</div> : null}
      {vm.loading ? (
        <div className="workbench-skeleton">
          <div />
          <div />
          <div />
        </div>
      ) : (
        <main className="workbench-grid">
          <PipelinePanel vm={vm} />
          <div className="workbench-center">
            <ShotPanel vm={vm} />
            <ArtifactPanel vm={vm} />
          </div>
          <FinalAndTracePanel vm={vm} />
        </main>
      )}
      {vm.refreshing || vm.hasActiveGeneration ? (
        <div className="workbench-live-strip">
          <span />
          Syncing backend state
        </div>
      ) : null}
    </div>
  );
}
