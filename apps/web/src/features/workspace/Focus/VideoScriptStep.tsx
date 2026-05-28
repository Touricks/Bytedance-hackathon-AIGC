import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listVideoScripts,
  patchVideoScript,
  proposeVideoScript,
} from "../../../lib/api/videoScript.js";
import { createVideoBatch } from "../../../lib/api/videoBatch.js";
import { useConfigLimits } from "../hooks/useConfigLimits.js";
import { AssetStrip } from "./AssetStrip.js";
import { VersionChips } from "./VersionChips.js";
import { StaleBanner } from "./StaleBanner.js";
import { navigateFocus } from "../WorkspaceLayout.js";

interface ScriptFormValues {
  durationSec: number;
  cameraMotion: string;
  subjectMotion: string;
  providerPrompt: string;
  voiceover: string;
}

function readScriptString(
  scriptJson: Record<string, unknown> | undefined,
  key: string,
): string {
  if (!scriptJson) return "";
  const value = scriptJson[key];
  return typeof value === "string" ? value : "";
}

export function VideoScriptStep({
  workspaceId,
  shotId,
}: {
  workspaceId: string;
  shotId: string;
}) {
  const qc = useQueryClient();
  const limits = useConfigLimits();
  const versions = useQuery({
    queryKey: ["video-scripts", shotId],
    queryFn: () => listVideoScripts(shotId),
  });
  const list = versions.data?.data ?? [];
  const active = list.find((v) => v.status === "ACTIVE") ?? list[0];
  const [selectedId, setSelectedId] = useState<string | null>(
    active?.id ?? null,
  );
  const showing = list.find((v) => v.id === (selectedId ?? active?.id));
  const { register, handleSubmit, reset } = useForm<ScriptFormValues>({
    values: showing
      ? {
          durationSec: showing.durationSec,
          cameraMotion: readScriptString(showing.scriptJson, "cameraMotion"),
          subjectMotion: readScriptString(showing.scriptJson, "subjectMotion"),
          providerPrompt: showing.providerPrompt,
          voiceover: readScriptString(showing.scriptJson, "voiceover"),
        }
      : {
          durationSec: 4,
          cameraMotion: "",
          subjectMotion: "",
          providerPrompt: "",
          voiceover: "",
        },
  });

  const propose = useMutation({
    mutationFn: (durationSec: number) =>
      proposeVideoScript(workspaceId, shotId, {
        durationSec,
        useNeighborFrames: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video-scripts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const patch = useMutation({
    mutationFn: (body: ScriptFormValues) =>
      patchVideoScript(shotId, active!.id, {
        baseVersion: active!.version,
        durationSec: body.durationSec,
        providerPrompt: body.providerPrompt,
        scriptJson: {
          ...(showing?.scriptJson ?? {}),
          cameraMotion: body.cameraMotion,
          subjectMotion: body.subjectMotion,
          voiceover: body.voiceover,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video-scripts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const [count, setCount] = useState(limits.defaultVideoBatchSize);
  const startBatch = useMutation({
    mutationFn: () => {
      const key = `${workspaceId}:${shotId}:video-batch:${active!.id}:${Date.now()}`;
      return createVideoBatch(
        shotId,
        {
          videoScriptArtifactId: active!.id,
          count,
          aspectRatio: "9:16",
        },
        key,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      navigateFocus({ workspaceId, shotId, step: "video_candidates" });
    },
  });

  if (!active) {
    return (
      <div className="step-card">
        <AssetStrip shotId={shotId} />
        <h2>视频剧本</h2>
        <p>当前分镜还没有视频剧本。</p>
        <button onClick={() => propose.mutate(4)}>
          生成初始剧本（4 秒）
        </button>
      </div>
    );
  }

  const showingIsStale = showing?.status === "STALE";

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>视频剧本</h2>
      {showingIsStale ? (
        <StaleBanner message="基础版本已变化，请重新加载或基于当前选图重新生成。" />
      ) : null}
      <VersionChips
        versions={list}
        activeId={showing?.id ?? null}
        onPick={(v) => {
          setSelectedId(v.id);
          reset({
            durationSec: v.durationSec,
            cameraMotion: readScriptString(v.scriptJson, "cameraMotion"),
            subjectMotion: readScriptString(v.scriptJson, "subjectMotion"),
            providerPrompt: v.providerPrompt,
            voiceover: readScriptString(v.scriptJson, "voiceover"),
          });
        }}
      />
      <form
        className="video-script-form"
        onSubmit={handleSubmit((body) => patch.mutate(body))}
      >
        <label>
          时长(秒)
          <input
            type="number"
            min={1}
            max={8}
            {...register("durationSec", {
              valueAsNumber: true,
              required: true,
            })}
          />
        </label>
        <label>
          镜头运动
          <input {...register("cameraMotion", { required: true })} />
        </label>
        <label>
          主体运动
          <input {...register("subjectMotion", { required: true })} />
        </label>
        <label>
          解说
          <input {...register("voiceover")} />
        </label>
        <label>
          Provider Prompt
          <textarea
            rows={6}
            {...register("providerPrompt", {
              required: true,
              minLength: 30,
            })}
          />
        </label>
        <div className="step-card__actions">
          <button type="submit" disabled={patch.isPending}>
            保存为新版本
          </button>
          <div className="step-card__count">
            <label>
              数量
              <input
                type="number"
                min={1}
                max={limits.maxVideoBatchSize}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              onClick={() => startBatch.mutate()}
              disabled={startBatch.isPending}
            >
              生成 {count} 个视频
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
