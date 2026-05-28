import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  listImagePrompts,
  patchImagePrompt,
  proposeImagePrompt,
} from "../../../lib/api/imagePrompt.js";
import { createImageBatch } from "../../../lib/api/imageBatch.js";
import { useConfigLimits } from "../hooks/useConfigLimits.js";
import { useShotAssetRefs } from "../hooks/useShotAssetRefs.js";
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
  const limits = useConfigLimits();
  const { refs } = useShotAssetRefs(shotId);
  const refIds = refs.map((r) => r.assetId);

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

  const { register, handleSubmit, reset } = useForm<{
    promptText: string;
    negativePrompt: string;
  }>({
    defaultValues: {
      promptText: showing?.promptText ?? "",
      negativePrompt: showing?.negativePrompt ?? "",
    },
    values: {
      promptText: showing?.promptText ?? "",
      negativePrompt: showing?.negativePrompt ?? "",
    },
  });

  const propose = useMutation({
    mutationFn: () =>
      proposeImagePrompt(workspaceId, shotId, { referenceAssetIds: refIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["image-prompts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const patch = useMutation({
    mutationFn: (body: { promptText: string; negativePrompt: string }) =>
      patchImagePrompt(shotId, active!.id, {
        promptText: body.promptText,
        negativePrompt: body.negativePrompt,
        referenceAssetIds: refIds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["image-prompts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const [count, setCount] = useState(limits.defaultImageBatchSize);
  const startBatch = useMutation({
    mutationFn: () => {
      const key = `${workspaceId}:${shotId}:image-batch:${active!.id}:${Date.now()}`;
      return createImageBatch(
        shotId,
        {
          imagePromptArtifactId: active!.id,
          count,
          aspectRatio: "9:16",
        },
        key,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      navigateFocus({ workspaceId, shotId, step: "image_candidates" });
    },
  });

  if (!active && !propose.isPending) {
    return (
      <div className="step-card">
        <AssetStrip shotId={shotId} />
        <h2>分镜图 Prompt</h2>
        <p>当前分镜还没有图 prompt。</p>
        <button onClick={() => propose.mutate()}>生成初始 Prompt</button>
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
          reset({
            promptText: v.promptText,
            negativePrompt: v.negativePrompt ?? "",
          });
        }}
      />
      <form
        className="image-prompt-form"
        onSubmit={handleSubmit((body) => patch.mutate(body))}
      >
        <label>
          Prompt
          <textarea rows={8} {...register("promptText", { required: true })} />
        </label>
        <label>
          Negative Prompt
          <input {...register("negativePrompt")} />
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
                max={limits.maxImageBatchSize}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              disabled={!active || startBatch.isPending}
              onClick={() => startBatch.mutate()}
            >
              生成 {count} 张图
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
