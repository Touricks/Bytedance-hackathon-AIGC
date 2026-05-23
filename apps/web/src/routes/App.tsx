import { useEffect, useState } from "react";
import type {
  CreateCreativeBlueprintRequest,
  CreativeBlueprint
} from "@aigc-video/shared";
import {
  createCreativeBlueprint,
  createGenerationJob,
  getCreativeBlueprint,
  type CreativeBlueprintDetail
} from "../lib/api/client.js";
import { useGenerationJob } from "../lib/job/useGenerationJob.js";
import {
  readReviewStateFromSearch,
  writeReviewStateToCurrentUrl
} from "../lib/reviewState.js";
import { MaterialForm } from "../features/material/MaterialForm.js";
import { JobProgress } from "../features/creation/JobProgress.js";
import { ScriptPanel } from "../features/script/ScriptPanel.js";
import { VideoPreview } from "../features/creation/VideoPreview.js";

export function App() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<CreativeBlueprintDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingVideo, setIsCreatingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const jobQuery = useGenerationJob(jobId);

  useEffect(() => {
    const state = readReviewStateFromSearch(window.location.search);
    let cancelled = false;

    if (state.jobId) {
      setJobId(state.jobId);
    }

    if (state.scriptId) {
      getCreativeBlueprint(state.scriptId)
        .then((result) => {
          if (!cancelled) {
            setBlueprint(result);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setVideoError(
              error instanceof Error ? error.message : "恢复创作蓝图失败"
            );
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(input: CreateCreativeBlueprintRequest) {
    setIsSubmitting(true);
    try {
      const result = await createCreativeBlueprint(input);
      setBlueprint(result);
      setJobId(null);
      setVideoError(null);
      writeReviewStateToCurrentUrl({ scriptId: result.scriptId });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateVideo() {
    if (!blueprint) {
      return;
    }

    setIsCreatingVideo(true);
    setVideoError(null);
    try {
      const result = await createGenerationJob({ scriptId: blueprint.scriptId });
      setJobId(result.job.id);
      writeReviewStateToCurrentUrl({
        scriptId: blueprint.scriptId,
        jobId: result.job.id
      });
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : "创建成片任务失败");
    } finally {
      setIsCreatingVideo(false);
    }
  }

  const detail = jobQuery.data;
  const detailCreativeBlueprint = getCreativeBlueprintFromScript(
    detail?.script?.rawJson
  );
  const visibleScript = blueprint?.script ?? detail?.script;
  const visibleBlueprint = blueprint?.creativeBlueprint ?? detailCreativeBlueprint;
  const visibleShots = blueprint?.shots ?? detail?.shots;

  return (
    <main className="app-shell">
      <header>
        <p className="eyebrow">Ecommerce AIGC Video</p>
        <h1>带货视频生成工作台</h1>
        <p>
          V0 路径：商品素材与创作参数 → 创作蓝图只读确认 → 一键成片 →
          预览导出。
        </p>
      </header>
      <div className="workspace-grid">
        <MaterialForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        <section className="panel action-panel">
          <div className="section-heading">
            <h2>一键成片</h2>
            <span>{blueprint ? "ready" : "waiting"}</span>
          </div>
          <p>
            {blueprint
              ? "创作蓝图已生成，可创建异步成片任务。"
              : "先生成创作蓝图，再创建成片任务。"}
          </p>
          <button
            type="button"
            disabled={!blueprint || isCreatingVideo}
            onClick={handleCreateVideo}
          >
            {isCreatingVideo ? "创建中..." : "一键成片"}
          </button>
          {videoError ? <p className="error">{videoError}</p> : null}
        </section>
        <JobProgress job={detail?.job} />
        <ScriptPanel
          script={visibleScript}
          creativeBlueprint={visibleBlueprint}
          shots={visibleShots}
        />
        <VideoPreview finalAsset={detail?.finalAsset} />
      </div>
    </main>
  );
}

function getCreativeBlueprintFromScript(rawJson: unknown): CreativeBlueprint | undefined {
  if (!rawJson || typeof rawJson !== "object" || !("creativeBlueprint" in rawJson)) {
    return undefined;
  }

  return (rawJson as { creativeBlueprint: CreativeBlueprint }).creativeBlueprint;
}
