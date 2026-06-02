import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listImagePrompts, proposeImagePrompt } from "../../../lib/api/imagePrompt.js";
import { AssetStrip } from "./AssetStrip.js";
import { VersionChips } from "./VersionChips.js";
import { navigateFocus } from "../WorkspaceLayout.js";

export function ImagePromptStep({
  workspaceId,
  shotId,
}: {
  workspaceId: string;
  shotId: string;
}) {
  const qc = useQueryClient();
  const [userDirection, setUserDirection] = useState("");

  const versions = useQuery({
    queryKey: ["image-prompts", shotId],
    queryFn: () => listImagePrompts(shotId),
  });
  const list = versions.data?.data ?? [];
  const active = list.find((v) => v.status === "ACTIVE") ?? list[0];
  const [selectedId, setSelectedId] = useState<string | null>(
    active?.id ?? null,
  );
  const showing =
    list.find((v) => v.id === (selectedId ?? active?.id)) ?? null;

  const propose = useMutation({
    mutationFn: () =>
      proposeImagePrompt(workspaceId, shotId, {
        userDirection: userDirection.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["image-prompts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      qc.invalidateQueries({ queryKey: ["image-rounds", workspaceId, shotId] });
      navigateFocus({ workspaceId, shotId, step: "image_candidates" });
    },
  });

  if (!active && !propose.isPending) {
    return (
      <div className="step-card">
        <AssetStrip shotId={shotId} />
        <h2>分镜图 Prompt</h2>
        <p>当前分镜还没有图 prompt。</p>
        <label>
          调整方向
          <textarea
            rows={3}
            value={userDirection}
            onChange={(event) => setUserDirection(event.target.value)}
            placeholder="可选：描述本轮图像候选要强化或修正的方向"
          />
        </label>
        <button onClick={() => propose.mutate()}>生成图片候选</button>
      </div>
    );
  }

  if (propose.isPending || versions.isLoading)
    return <div className="step-card">加载中…</div>;

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>分镜图 Prompt</h2>
      <VersionChips
        versions={list}
        activeId={showing?.id ?? null}
        onPick={(v) => {
          setSelectedId(v.id);
        }}
      />
      <div className="image-prompt-form">
        <label>
          调整方向
          <textarea
            rows={3}
            value={userDirection}
            onChange={(event) => setUserDirection(event.target.value)}
            placeholder="可选：描述本轮图像候选要强化或修正的方向"
          />
        </label>
        <label>
          Prompt
          <textarea rows={8} readOnly value={showing?.promptText ?? ""} />
        </label>
        <label>
          Negative Prompt
          <input readOnly value={showing?.negativePrompt ?? ""} />
        </label>
        <div className="step-card__actions">
          <button
            type="button"
            disabled={propose.isPending}
            onClick={() => propose.mutate()}
          >
            生成图片候选
          </button>
        </div>
      </div>
    </div>
  );
}
