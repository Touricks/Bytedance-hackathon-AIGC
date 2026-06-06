import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, PackageCheck, Sparkles, Tags } from "lucide-react";
import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import { toWorkspaceMaterialUrl } from "../../../lib/api/client.js";
import { materialAssetFilename } from "../../../lib/materials.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { MaterialAssetPreview, ProposalPlaceholder } from "./Common.js";

const materialRoleOptions: Array<MaterialIntakeArtifact["assets"][number]["role"]> = [
  "product_main",
  "product_detail",
  "packaging",
  "logo",
  "demo_video",
  "spec_text",
  "reference",
  "other"
];

const materialRelevanceOptions: Array<
  MaterialIntakeArtifact["assets"][number]["relevance"]
> = ["high", "medium", "low"];

const materialRoleLabels: Record<
  MaterialIntakeArtifact["assets"][number]["role"],
  string
> = {
  product_main: "主商品",
  product_detail: "商品细节",
  packaging: "包装",
  logo: "品牌标识",
  demo_video: "演示视频",
  spec_text: "规格文本",
  reference: "参考素材",
  other: "其他"
};

const materialRelevanceLabels: Record<
  MaterialIntakeArtifact["assets"][number]["relevance"],
  string
> = {
  high: "高",
  medium: "中",
  low: "低"
};

const oneClickStageLabels: Record<string, string> = {
  product_brief: "生成商品卖点",
  storyboard: "生成分镜脚本",
  shotprompt: "生成分镜生成要求",
  shot_set: "应用分镜链路",
  image_selection: "生成并选择分镜图",
  video_selection: "生成并选择分镜视频",
  final_compose: "生成成片",
  completed: "已生成成片"
};

function normalizeMaterialIntakeDraft(
  draft: MaterialIntakeArtifact
): MaterialIntakeArtifact {
  return {
    ...draft,
    assets: draft.assets.map((asset) => ({
      ...asset,
      description: asset.description.trim()
    }))
  };
}

export function MaterialIntakeReview({
  vm,
  onActionComplete
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const artifact = vm.artifacts.material;
  const initialData = useMemo<MaterialIntakeArtifact>(
    () =>
      artifact?.data ?? {
        scannedAt: new Date(0).toISOString(),
        primaryProductRef: "",
        assets: [],
        rejected: []
      },
    [artifact?.data]
  );
  const [draft, setDraft] = useState<MaterialIntakeArtifact>(initialData);

  useEffect(() => {
    setDraft(initialData);
  }, [artifact?.id, initialData]);

  if (!artifact) {
    return (
      <ProposalPlaceholder
        title="素材解读"
        actionLabel="生成素材解读"
        busy={vm.busy}
        onAction={() => {
          vm.actions.runMaterialIntake();
          onActionComplete();
        }}
      />
    );
  }

  const updateAsset = (
    ref: string,
    patch: Partial<MaterialIntakeArtifact["assets"][number]>
  ) => {
    setDraft((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        asset.ref === ref ? { ...asset, ...patch } : asset
      ),
      primaryProductRef:
        patch.included === false && current.primaryProductRef === ref
          ? (current.assets.find((asset) => asset.ref !== ref && asset.included)?.ref ??
            current.primaryProductRef)
          : current.primaryProductRef
    }));
  };

  const includedAssets = draft.assets.filter((asset) => asset.included);
  const hasBlankDescriptions = draft.assets.some(
    (asset) => asset.description.trim().length === 0
  );
  const canApprove =
    includedAssets.some(
      (asset) => asset.ref === draft.primaryProductRef && asset.usable
    ) && !hasBlankDescriptions;
  const oneClickJob = vm.oneClickFinalVideo;
  const oneClickActive =
    oneClickJob?.status === "PENDING" ||
    oneClickJob?.status === "RUNNING" ||
    oneClickJob?.status === "WAITING";
  const oneClickStage = oneClickJob
    ? (oneClickStageLabels[oneClickJob.currentStage] ?? oneClickJob.currentStage)
    : null;
  const oneClickTone =
    oneClickJob?.status === "FAILED"
      ? "danger"
      : oneClickJob?.status === "SUCCEEDED"
        ? "good"
        : "busy";

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <h1>素材解读</h1>
      </div>
      <div className="material-intake-summary">
        <div>
          <PackageCheck size={18} />
          <span>主商品素材</span>
        </div>
        <select
          value={draft.primaryProductRef}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              primaryProductRef: event.target.value
            }))
          }
        >
          {includedAssets.map((asset) => (
            <option key={asset.ref} value={asset.ref}>
              {materialAssetFilename(asset.ref)}
            </option>
          ))}
        </select>
      </div>
      <div className="material-intake-grid">
        {draft.assets.map((asset) => {
          const filename = materialAssetFilename(asset.ref);
          return (
            <article key={asset.ref} className="material-intake-card">
              <MaterialAssetPreview
                kind={asset.kind}
                src={toWorkspaceMaterialUrl(vm.workspaceId, asset.ref)}
                filename={filename}
                className="material-intake-card__preview"
              />
              <div className="material-intake-card__body">
                <div className="material-intake-card__title">
                  <strong title={filename}>{filename}</strong>
                  <button
                    type="button"
                    className={`material-intake-card__toggle ${
                      asset.included ? "is-included" : "is-excluded"
                    }`}
                    aria-pressed={asset.included}
                    disabled={!asset.usable}
                    title={
                      asset.usable
                        ? asset.included
                          ? "点击后本轮不使用该素材"
                          : "点击后纳入本轮生成链路"
                        : "系统判定该素材不可用"
                    }
                    onClick={() => updateAsset(asset.ref, { included: !asset.included })}
                  >
                    {asset.included ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                    <span>
                      {asset.usable ? (asset.included ? "已纳入" : "不纳入") : "系统拒绝"}
                    </span>
                  </button>
                </div>
                <div className="material-intake-fields">
                  <label>
                    素材标签
                    <select
                      value={asset.role}
                      onChange={(event) =>
                        updateAsset(asset.ref, {
                          role: event.target
                            .value as MaterialIntakeArtifact["assets"][number]["role"]
                        })
                      }
                    >
                      {materialRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {materialRoleLabels[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    相关性
                    <select
                      value={asset.relevance}
                      onChange={(event) =>
                        updateAsset(asset.ref, {
                          relevance: event.target
                            .value as MaterialIntakeArtifact["assets"][number]["relevance"]
                        })
                      }
                    >
                      {materialRelevanceOptions.map((relevance) => (
                        <option key={relevance} value={relevance}>
                          {materialRelevanceLabels[relevance]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="material-intake-fields__wide">
                    解读说明（必填）
                    <textarea
                      rows={3}
                      value={asset.description}
                      required
                      aria-invalid={asset.description.trim().length === 0}
                      placeholder="补充素材内容、用途或关键视觉信息，不能为空。"
                      onChange={(event) =>
                        updateAsset(asset.ref, { description: event.target.value })
                      }
                    />
                    {asset.description.trim().length === 0 ? (
                      <span className="material-intake-fields__error">
                        解读说明不能为空
                      </span>
                    ) : (
                      <span className="material-intake-fields__hint">
                        这段说明会作为后续商品卖点、分镜和单镜生成的素材依据。
                      </span>
                    )}
                  </label>
                </div>
                <div className="material-intake-meta">
                  <span>{asset.usable ? "可用于生成" : "系统判定不可用"}</span>
                  <span>{Math.round(asset.bytes / 1024)} KB</span>
                  <code>{asset.ref}</code>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {draft.rejected.length > 0 ? (
        <div className="material-intake-rejected">
          <Tags size={16} />
          <div>
            <strong>系统拒绝素材</strong>
            {draft.rejected.map((item) => (
              <span key={item.ref}>
                {materialAssetFilename(item.ref)}：{item.reason}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || !canApprove}
          onClick={() => {
            vm.actions.approveMaterialIntakeAndProposeBrief(
              normalizeMaterialIntakeDraft(draft)
            );
            onActionComplete();
          }}
        >
          <CheckCircle2 size={16} />
          {vm.pending?.productBrief
            ? "正在生成商品卖点..."
            : "批准素材解读并生成商品卖点"}
        </button>
        <button
          type="button"
          className="review-primary review-primary--one-click"
          disabled={vm.busy || !canApprove}
          onClick={() => {
            vm.actions.startOneClickFinalVideo(normalizeMaterialIntakeDraft(draft));
            onActionComplete();
          }}
        >
          <Sparkles size={16} />
          {oneClickActive ? "正在一键成片..." : "全自动一键成片"}
        </button>
        <span className="review-action-note">
          {hasBlankDescriptions
            ? "每个素材都需要填写解读说明。"
            : "素材标签只描述素材角色，不会修改上传文件本身。"}
        </span>
      </div>
      {oneClickJob ? (
        <div className="review-one-click-progress">
          <span className={`review-status review-status--${oneClickTone}`}>
            {oneClickJob.status === "WAITING" ? "RUNNING" : oneClickJob.status}
          </span>
          <strong>{oneClickStage}</strong>
          {oneClickJob.errorMessage ? (
            <span className="review-error">{oneClickJob.errorMessage}</span>
          ) : (
            <span>一键链路会保留已生成的中间产物，可随时回到对应步骤手动继续。</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
