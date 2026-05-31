import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listVideoScripts, proposeVideoScript } from "../../../lib/api/videoScript.js";
import { AssetStrip } from "./AssetStrip.js";
import { VersionChips } from "./VersionChips.js";
import { StaleBanner } from "./StaleBanner.js";
import { navigateFocus } from "../WorkspaceLayout.js";

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
  const [userDirection, setUserDirection] = useState("");
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

  const propose = useMutation({
    mutationFn: () =>
      proposeVideoScript(workspaceId, shotId, {
        userDirection: userDirection.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video-scripts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      qc.invalidateQueries({ queryKey: ["video-rounds", workspaceId, shotId] });
      navigateFocus({ workspaceId, shotId, step: "video_candidates" });
    },
  });

  if (!active) {
    return (
      <div className="step-card">
        <AssetStrip shotId={shotId} />
        <h2>视频剧本</h2>
        <p>当前分镜还没有视频剧本。</p>
        <label>
          调整方向
          <textarea
            rows={3}
            value={userDirection}
            onChange={(event) => setUserDirection(event.target.value)}
            placeholder="可选：描述本轮视频候选要强化或修正的方向"
          />
        </label>
        <button onClick={() => propose.mutate()} disabled={propose.isPending}>
          生成视频候选
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
        }}
      />
      <div className="video-script-form">
        <label>
          调整方向
          <textarea
            rows={3}
            value={userDirection}
            onChange={(event) => setUserDirection(event.target.value)}
            placeholder="可选：描述本轮视频候选要强化或修正的方向"
          />
        </label>
        <label>
          时长(秒)
          <input readOnly value={showing?.durationSec ?? ""} />
        </label>
        <label>
          镜头运动
          <input
            readOnly
            value={readScriptString(showing?.scriptJson, "cameraMotion")}
          />
        </label>
        <label>
          主体运动
          <input
            readOnly
            value={readScriptString(showing?.scriptJson, "subjectMotion")}
          />
        </label>
        <label>
          解说
          <input
            readOnly
            value={readScriptString(showing?.scriptJson, "voiceover")}
          />
        </label>
        <label>
          Provider Prompt
          <textarea rows={6} readOnly value={showing?.providerPrompt ?? ""} />
        </label>
        <div className="step-card__actions">
          <button
            type="button"
            onClick={() => propose.mutate()}
            disabled={propose.isPending}
          >
            生成视频候选
          </button>
        </div>
      </div>
    </div>
  );
}
