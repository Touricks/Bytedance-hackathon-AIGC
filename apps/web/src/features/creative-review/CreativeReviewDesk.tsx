import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Layers3,
  Play,
  RefreshCw,
  Upload,
  Wand2,
} from "lucide-react";
import type {
  ProductBriefArtifact,
  ShotPromptArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import {
  toAbsoluteAssetUrl,
  toWorkspaceMaterialUrl,
  type PromptRequirementsData,
} from "../../lib/api/client.js";
import { materialAssetFilename } from "../../lib/materials.js";
import type { WorkbenchViewModel } from "../workbench/useWorkbenchViewModel.js";
import { useWorkbenchViewModel } from "../workbench/useWorkbenchViewModel.js";
import {
  canConfirmSelection,
  isSelectableCandidate,
  stageCandidate,
} from "./imageSelection.js";

function backToWorkspaces() {
  window.history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function statusTone(value: string | null | undefined) {
  if (!value) return "idle";
  if (value.includes("FAILED") || value === "failed") return "danger";
  if (value.includes("SELECTED") || value === "approved" || value === "SUCCEEDED") {
    return "good";
  }
  if (value.includes("GENERATING") || value.includes("PROPOSING") || value === "PENDING" || value === "RUNNING") {
    return "busy";
  }
  if (value === "proposed" || value.includes("READY") || value === "PARTIAL") {
    return "review";
  }
  return "idle";
}

function isTerminalReady(status: string | null | undefined) {
  return status === "SUCCEEDED" || status === "PARTIAL";
}

type ReviewStepId =
  | "requirements"
  | "brief"
  | "storyboard"
  | "shotprompt"
  | "image"
  | "video"
  | "final";

const reviewStepOrder: ReviewStepId[] = [
  "requirements",
  "brief",
  "storyboard",
  "shotprompt",
  "image",
  "video",
  "final",
];

type ReviewModuleId = "product-brief" | "storyboard" | "shotprompt";

function deriveActiveStep(vm: WorkbenchViewModel): ReviewStepId {
  const hasRequirements = Boolean(vm.artifacts.promptRequirements?.isCurrent);
  const brief = vm.artifacts.brief;
  const storyboard = vm.artifacts.storyboard;
  const shotPrompt = vm.artifacts.shotPrompt;
  const hasActiveShotSet = Boolean(vm.workspaceStatus?.activeShotSet);
  const hasShots = vm.shots.length > 0;
  const allImagesSelected =
    hasShots && vm.shots.every((shot) => Boolean(shot.selectedImageId));
  const allVideosSelected =
    hasShots && vm.shots.every((shot) => Boolean(shot.selectedVideoId));

  if (!hasRequirements || !brief) return "requirements";
  if (!brief.isCurrent) return "brief";
  if (!storyboard || !storyboard.isCurrent) return "storyboard";
  if (!shotPrompt || !shotPrompt.isCurrent || !hasActiveShotSet) return "shotprompt";
  if (!allImagesSelected) return "image";
  if (!allVideosSelected) return "video";
  return "final";
}

function canOpenReviewStep(
  vm: WorkbenchViewModel,
  stepId: ReviewStepId,
  defaultStep: ReviewStepId,
) {
  const defaultIndex = reviewStepOrder.indexOf(defaultStep);
  const stepIndex = reviewStepOrder.indexOf(stepId);
  if (stepIndex <= defaultIndex) return true;

  switch (stepId) {
    case "requirements":
      return true;
    case "brief":
      return Boolean(vm.artifacts.brief);
    case "storyboard":
      return Boolean(vm.artifacts.storyboard);
    case "shotprompt":
      return Boolean(vm.artifacts.shotPrompt);
    case "image":
      return Boolean(vm.workspaceStatus?.activeShotSet) || vm.shots.length > 0;
    case "video":
      return vm.shots.some((shot) => Boolean(shot.selectedImageId));
    case "final":
      return Boolean(vm.workflow?.canComposeFinalVideo);
  }
}

function StepRail({
  vm,
  active,
  defaultStep,
  onSelect,
  onShotSelect,
}: {
  vm: WorkbenchViewModel;
  active: ReviewStepId;
  defaultStep: ReviewStepId;
  onSelect: (step: ReviewStepId) => void;
  onShotSelect: (shotId: string) => void;
}) {
  const moduleUpstreamChanged = (moduleId: ReviewModuleId) =>
    Boolean(vm.workspaceStatus?.modules?.[moduleId]?.upstream?.upstreamChanged);
  const steps: Array<{
    id: ReviewStepId;
    label: string;
    state: string;
  }> = [
    {
      id: "requirements",
      label: "创作要求与上传素材",
      state: vm.artifacts.promptRequirements?.isCurrent ? "已确认" : "待提交",
    },
    {
      id: "brief",
      label: "商品卖点审核",
      state: moduleUpstreamChanged("product-brief")
        ? "上游已变化"
        : (vm.artifacts.brief?.status ?? "等待生成"),
    },
    {
      id: "storyboard",
      label: "分镜规划",
      state: moduleUpstreamChanged("storyboard")
        ? "上游已变化"
        : (vm.artifacts.storyboard?.status ?? "等待生成"),
    },
    {
      id: "shotprompt",
      label: "分镜生成要求",
      state: moduleUpstreamChanged("shotprompt")
        ? "上游已变化"
        : (vm.artifacts.shotPrompt?.status ?? "等待生成"),
    },
    {
      id: "image",
      label: "分镜图选择",
      state: `${vm.shots.filter((shot) => shot.selectedImageId).length}/${vm.shots.length || 0}`,
    },
    {
      id: "video",
      label: "分镜视频选择",
      state: `${vm.shots.filter((shot) => shot.selectedVideoId).length}/${vm.shots.length || 0}`,
    },
    {
      id: "final",
      label: "生成成片",
      state: vm.workflow?.canComposeFinalVideo ? "可生成" : "等待选择",
    },
  ];

  return (
    <aside className="review-rail">
      <div className="review-rail__brand">
        <Layers3 size={18} />
        <div>
          <span>创作审核台</span>
        </div>
      </div>
      <ol className="review-steps">
        {steps.map((step, index) => {
          const reachable = canOpenReviewStep(vm, step.id, defaultStep);
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`review-step ${active === step.id ? "review-step--active" : ""} ${
                  reachable ? "" : "review-step--locked"
                }`}
                disabled={!reachable}
                onClick={() => onSelect(step.id)}
                aria-current={active === step.id ? "step" : undefined}
              >
                <span className="review-step__index">{index + 1}</span>
                <span className="review-step__label">{step.label}</span>
                <span
                  className={`review-step__state review-step__state--${statusTone(step.state)}`}
                >
                  {step.state}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {vm.shots.length > 0 ? (
        <section className="review-shot-nav">
          <h3>分镜列表</h3>
          {vm.shots.map((shot) => (
            <button
              key={shot.shotId}
              type="button"
              className={
                shot.shotId === vm.selectedShotId
                  ? "review-shot-nav__item review-shot-nav__item--active"
                  : "review-shot-nav__item"
              }
              onClick={() => onShotSelect(shot.shotId)}
            >
              <span className="review-shot-nav__index">{shot.orderIndex + 1}</span>
              {shot.selectedImageUrl ? (
                <img
                  className="review-shot-nav__thumb"
                  src={toAbsoluteAssetUrl(shot.selectedImageUrl)}
                  alt={`Shot ${shot.orderIndex + 1} 已选分镜图`}
                />
              ) : (
                <span
                  className="review-shot-nav__thumb review-shot-nav__thumb--empty"
                  aria-hidden="true"
                />
              )}
              <strong>{shot.status}</strong>
            </button>
          ))}
        </section>
      ) : null}
    </aside>
  );
}

function RightRail({ vm }: { vm: WorkbenchViewModel }) {
  const assets = vm.materialLibrary?.assets ?? [];
  return (
    <aside className="review-side">
      <section className="review-side__section">
        <div className="review-side__head">
          <Upload size={16} />
          <h2>素材库</h2>
        </div>
        {assets.length === 0 ? (
          <p className="review-muted">还没有上传素材。</p>
        ) : (
          <div className="review-assets">
            {assets.map((asset) => {
              const filename = materialAssetFilename(asset.ref);
              return (
                <div
                  key={asset.ref}
                  className="review-asset"
                  title={asset.description}
                >
                  {asset.kind === "image" ? (
                    <img
                      src={toWorkspaceMaterialUrl(vm.workspaceId, asset.ref)}
                      alt={filename}
                    />
                  ) : (
                    <FileText size={18} />
                  )}
                  <span title={filename}>{filename}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="review-side__section">
        <div className="review-side__head">
          <Clock3 size={16} />
          <h2>创作会话追踪</h2>
        </div>
        {vm.traces.length === 0 ? (
          <p className="review-muted">暂无追踪事件。</p>
        ) : (
          <div className="review-traces">
            {vm.traces.map((trace) => (
              <div key={trace.id} className="review-trace">
                <span>{trace.traceType}</span>
                <strong>{trace.name}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function stringifyRequirementValue(value: unknown, fallback: string) {
  if (Array.isArray(value)) return value.join("，");
  return typeof value === "string" && value.trim() ? value : fallback;
}

function requirementSection(
  data: PromptRequirementsData | null,
  section: "image" | "script" | "storyboard" | "shotImage" | "shotVideo",
) {
  const value = data?.[section];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requirementFormFromArtifact(data: PromptRequirementsData | null) {
  const image = requirementSection(data, "image");
  const script = requirementSection(data, "script");
  const storyboard = requirementSection(data, "storyboard");
  const shotImage = requirementSection(data, "shotImage");
  const shotVideo = requirementSection(data, "shotVideo");
  return {
    imageStyle: stringifyRequirementValue(
      image.style,
      "真实电商产品摄影，保留商品材质和品牌识别",
    ),
    imageComposition: stringifyRequirementValue(
      image.composition,
      "干净主视觉，主体稳定，避免无关道具抢占画面",
    ),
    imageAvoid: stringifyRequirementValue(
      image.avoid,
      "文字贴片、商品变形、额外产品变体、环境漂移",
    ),
    scriptTone: stringifyRequirementValue(script.tone, "直接、可信、卖点清晰"),
    storyboardRhythm: stringifyRequirementValue(
      storyboard.rhythm,
      "开场快，卖点明确，证明充分，结尾行动引导清楚",
    ),
    shotImageGlobal: stringifyRequirementValue(
      shotImage.global,
      "每张分镜图延续前一镜环境、灯光、构图和商品身份",
    ),
    shotVideoGlobal: stringifyRequirementValue(
      shotVideo.global,
      "镜头运动平滑，前后镜头保持空间连续",
    ),
  };
}

function RequirementsStart({
  vm,
  onActionComplete,
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const assets = vm.materialLibrary?.assets ?? [];
  const requirementsArtifact = vm.artifacts.promptRequirements;
  const initialForm = useMemo(
    () =>
      requirementFormFromArtifact(
        (requirementsArtifact?.data as PromptRequirementsData | undefined) ?? null,
      ),
    [requirementsArtifact?.id, requirementsArtifact?.data],
  );
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const data: PromptRequirementsData = useMemo(
    () => ({
      image: {
        style: form.imageStyle,
        composition: form.imageComposition,
        avoid: form.imageAvoid
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
      },
      script: {
        tone: form.scriptTone,
      },
      storyboard: {
        rhythm: form.storyboardRhythm,
      },
      shotImage: {
        global: form.shotImageGlobal,
      },
      shotVideo: {
        global: form.shotVideoGlobal,
      },
    }),
    [form],
  );

  return (
    <section className="review-panel review-panel--start">
      <div className="review-panel__header">
        <span>首屏</span>
        <h1>创作要求 + 上传素材</h1>
        <p>
          先确认商家的创作要求和商品素材。提交后系统会自动完成素材理解，并停在商品卖点审核。
        </p>
      </div>
      <div className="review-upload-row">
        <label className="review-upload">
          <Upload size={16} />
          上传素材
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
        <span>{assets.length > 0 ? `已上传 ${assets.length} 个素材` : "请先上传至少一个商品素材"}</span>
      </div>
      <div className="review-form-grid">
        <label>
          图像风格
          <textarea
            rows={3}
            value={form.imageStyle}
            onChange={(event) => update("imageStyle", event.target.value)}
          />
        </label>
        <label>
          图像构图
          <textarea
            rows={3}
            value={form.imageComposition}
            onChange={(event) => update("imageComposition", event.target.value)}
          />
        </label>
        <label>
          图像避免项
          <textarea
            rows={3}
            value={form.imageAvoid}
            onChange={(event) => update("imageAvoid", event.target.value)}
          />
        </label>
        <label>
          剧本语气
          <textarea
            rows={3}
            value={form.scriptTone}
            onChange={(event) => update("scriptTone", event.target.value)}
          />
        </label>
        <label>
          分镜节奏
          <textarea
            rows={3}
            value={form.storyboardRhythm}
            onChange={(event) => update("storyboardRhythm", event.target.value)}
          />
        </label>
        <label>
          分镜图全局要求
          <textarea
            rows={3}
            value={form.shotImageGlobal}
            onChange={(event) => update("shotImageGlobal", event.target.value)}
          />
        </label>
        <label className="review-form-grid__wide">
          分镜视频全局要求
          <textarea
            rows={3}
            value={form.shotVideoGlobal}
            onChange={(event) => update("shotVideoGlobal", event.target.value)}
          />
        </label>
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || assets.length === 0}
          onClick={() => {
            vm.actions.startCreativeReview(data);
            onActionComplete();
          }}
        >
          <Wand2 size={16} />
          {requirementsArtifact?.isCurrent ? "更新创作要求" : "提交创作要求"}
        </button>
      </div>
    </section>
  );
}

function ProposalPlaceholder({
  title,
  description,
  actionLabel,
  busy,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  busy: boolean;
  onAction: () => void;
}) {
  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>等待生成</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="review-empty-state">
        <FileText size={22} />
        <strong>当前审核内容还没有生成。</strong>
        <span>点击后会读取上游生效创作产物，并创建新的待审创作产物。</span>
      </div>
      <div className="review-panel__actions">
        <button type="button" className="review-primary" onClick={onAction} disabled={busy}>
          <Wand2 size={16} />
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

type ProductBriefFormState = {
  productName: string;
  category: string;
  coreSellingPoint: string;
  audienceWho: string;
  audiencePainOrDesire: string;
  brandTone: string;
  platform: string;
  keyFacts: string;
  proof: string;
  bannedExpressions: string;
  offer: string;
  landingInfo: string;
  assumptions: string;
};

function linesFromText(value: string) {
  return value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function briefToForm(brief: ProductBriefArtifact): ProductBriefFormState {
  return {
    productName: brief.product.name,
    category: brief.product.category,
    coreSellingPoint: brief.coreSellingPoint,
    audienceWho: brief.audience.who,
    audiencePainOrDesire: brief.audience.painOrDesire,
    brandTone: brief.brandTone,
    platform: brief.platform,
    keyFacts: brief.product.keyFacts.join("\n"),
    proof: brief.proof.join("\n"),
    bannedExpressions: brief.bannedExpressions.join("\n"),
    offer: brief.offer ?? "",
    landingInfo: brief.landingInfo ?? "",
    assumptions: brief.assumptions.join("\n"),
  };
}

function formToBrief(
  form: ProductBriefFormState,
  current: ProductBriefArtifact,
): ProductBriefArtifact {
  return {
    ...current,
    product: {
      ...current.product,
      name: form.productName.trim(),
      category: form.category.trim(),
      keyFacts: linesFromText(form.keyFacts),
    },
    audience: {
      ...current.audience,
      who: form.audienceWho.trim(),
      painOrDesire: form.audiencePainOrDesire.trim(),
    },
    coreSellingPoint: form.coreSellingPoint.trim(),
    proof: linesFromText(form.proof),
    offer: form.offer.trim() || null,
    platform: form.platform.trim(),
    brandTone: form.brandTone.trim(),
    bannedExpressions: linesFromText(form.bannedExpressions),
    landingInfo: form.landingInfo.trim() || null,
    assumptions: linesFromText(form.assumptions),
  };
}

function ProductBriefReviewForm({
  artifactId,
  brief,
  busy,
  onApprove,
  onActionComplete,
}: {
  artifactId: string;
  brief: ProductBriefArtifact;
  busy: boolean;
  onApprove: (data: ProductBriefArtifact) => void;
  onActionComplete: () => void;
}) {
  const [form, setForm] = useState(() => briefToForm(brief));
  const [draft, setDraft] = useState<ProductBriefArtifact>(brief);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setForm(briefToForm(brief));
    setDraft(brief);
    setSubmitted(false);
  }, [artifactId, brief]);

  const update = (key: keyof ProductBriefFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitted(false);
  };

  const submitForm = () => {
    setDraft((current) => formToBrief(form, current));
    setSubmitted(true);
  };

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>待审创作产物</span>
        <h1>商品卖点审核</h1>
        <p>确认商品名、核心卖点、人群、语气和禁用表达后，再生成分镜规划。</p>
      </div>
      <div className="review-business-form" aria-label="商品卖点表单">
        <label>
          商品名称
          <input
            value={form.productName}
            onChange={(event) => update("productName", event.target.value)}
          />
        </label>
        <label>
          商品品类
          <input
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          核心卖点
          <textarea
            rows={3}
            value={form.coreSellingPoint}
            onChange={(event) => update("coreSellingPoint", event.target.value)}
          />
        </label>
        <label>
          目标人群
          <textarea
            rows={3}
            value={form.audienceWho}
            onChange={(event) => update("audienceWho", event.target.value)}
          />
        </label>
        <label>
          痛点或愿望
          <textarea
            rows={3}
            value={form.audiencePainOrDesire}
            onChange={(event) => update("audiencePainOrDesire", event.target.value)}
          />
        </label>
        <label>
          语气
          <input
            value={form.brandTone}
            onChange={(event) => update("brandTone", event.target.value)}
          />
        </label>
        <label>
          平台
          <input
            value={form.platform}
            onChange={(event) => update("platform", event.target.value)}
          />
        </label>
        <label>
          商品事实
          <textarea
            rows={4}
            value={form.keyFacts}
            onChange={(event) => update("keyFacts", event.target.value)}
          />
        </label>
        <label>
          证明素材
          <textarea
            rows={4}
            value={form.proof}
            onChange={(event) => update("proof", event.target.value)}
          />
        </label>
        <label>
          禁用表达
          <textarea
            rows={3}
            value={form.bannedExpressions}
            onChange={(event) => update("bannedExpressions", event.target.value)}
          />
        </label>
        <label>
          优惠信息
          <textarea
            rows={3}
            value={form.offer}
            onChange={(event) => update("offer", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          落地页信息
          <textarea
            rows={3}
            value={form.landingInfo}
            onChange={(event) => update("landingInfo", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          关键假设
          <textarea
            rows={4}
            value={form.assumptions}
            onChange={(event) => update("assumptions", event.target.value)}
          />
        </label>
      </div>
      <div className="review-panel__actions">
        <button type="button" className="review-secondary" onClick={submitForm}>
          <FileText size={16} />
          提交表单到结构化内容
        </button>
        <span className="review-action-note">
          {submitted ? "表单内容已同步到后端 payload。" : "修改表单后，请先同步到 payload。"}
        </span>
      </div>
      <label className="review-payload-debug">
        <span>后端 payload（只读）</span>
        <textarea
          aria-label="后端 payload（只读）"
          readOnly
          value={JSON.stringify(draft, null, 2)}
        />
      </label>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          onClick={() => {
            onApprove(draft);
            onActionComplete();
          }}
          disabled={busy}
        >
          <CheckCircle2 size={16} />
          批准商品卖点并生成分镜规划
        </button>
      </div>
    </section>
  );
}

function ProductBriefReview({
  vm,
  onActionComplete,
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const artifact = vm.artifacts.brief;
  if (!artifact) {
    return (
      <ProposalPlaceholder
        title="商品卖点审核"
        description="素材理解完成后，需要生成商品卖点供商家确认。"
        actionLabel="生成商品卖点"
        busy={vm.busy}
        onAction={() => {
          vm.actions.proposeBrief();
          onActionComplete();
        }}
      />
    );
  }
  const brief = artifact.data;
  return (
    <ProductBriefReviewForm
      artifactId={artifact.id}
      brief={brief}
      busy={vm.busy}
      onApprove={vm.actions.approveBriefAndProposeStoryboard}
      onActionComplete={onActionComplete}
    />
  );
}

type StoryboardShotFormState = {
  purpose: string;
  durationSec: string;
  scene: string;
  visualDirection: string;
  productAssetRef: string;
  voiceover: string;
  transition: string;
};

type StoryboardFormState = {
  narrative: string;
  totalDurationSec: string;
  assumptions: string;
  shots: StoryboardShotFormState[];
};

function storyboardToForm(storyboard: StoryboardArtifact): StoryboardFormState {
  return {
    narrative: storyboard.narrative,
    totalDurationSec: String(storyboard.totalDurationSec),
    assumptions: storyboard.assumptions.join("\n"),
    shots: storyboard.shots.map((shot) => ({
      purpose: shot.purpose,
      durationSec: String(shot.durationSec),
      scene: shot.scene,
      visualDirection: shot.visualDirection,
      productAssetRef: shot.productAssetRef,
      voiceover: shot.voiceover,
      transition: shot.transition,
    })),
  };
}

function normalizeStoryboardPurpose(
  value: string,
  fallback: StoryboardArtifact["shots"][number]["purpose"],
): StoryboardArtifact["shots"][number]["purpose"] {
  return ["hook", "benefit", "proof", "cta"].includes(value)
    ? (value as StoryboardArtifact["shots"][number]["purpose"])
    : fallback;
}

function positiveIntegerFromText(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeIntegerFromText(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function formToStoryboard(
  form: StoryboardFormState,
  current: StoryboardArtifact,
): StoryboardArtifact {
  return {
    ...current,
    narrative: form.narrative.trim(),
    totalDurationSec: positiveIntegerFromText(
      form.totalDurationSec,
      current.totalDurationSec,
    ),
    assumptions: linesFromText(form.assumptions),
    shots: form.shots.map((shot, index) => {
      const currentShot = current.shots[index] ?? current.shots[0]!;
      return {
        ...currentShot,
        index: currentShot.index,
        purpose: normalizeStoryboardPurpose(shot.purpose, currentShot.purpose),
        durationSec: positiveIntegerFromText(
          shot.durationSec,
          currentShot.durationSec,
        ),
        scene: shot.scene.trim(),
        visualDirection: shot.visualDirection.trim(),
        productAssetRef: shot.productAssetRef.trim(),
        voiceover: shot.voiceover.trim(),
        transition: shot.transition.trim(),
      };
    }),
  };
}

function StoryboardReviewForm({
  artifactId,
  storyboard,
  busy,
  onApprove,
  onActionComplete,
}: {
  artifactId: string;
  storyboard: StoryboardArtifact;
  busy: boolean;
  onApprove: (data: StoryboardArtifact) => void;
  onActionComplete: () => void;
}) {
  const [form, setForm] = useState(() => storyboardToForm(storyboard));
  const [draft, setDraft] = useState<StoryboardArtifact>(storyboard);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setForm(storyboardToForm(storyboard));
    setDraft(storyboard);
    setSubmitted(false);
  }, [artifactId, storyboard]);

  const update = (key: keyof Omit<StoryboardFormState, "shots">, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitted(false);
  };

  const updateShot = (
    index: number,
    key: keyof StoryboardShotFormState,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index ? { ...shot, [key]: value } : shot,
      ),
    }));
    setSubmitted(false);
  };

  const submitForm = () => {
    setDraft((current) => formToStoryboard(form, current));
    setSubmitted(true);
  };

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>待审创作产物</span>
        <h1>分镜规划</h1>
        <p>先确认叙事结构、镜头目标和节奏，再进入每个 shot 的生成要求。</p>
      </div>
      <div className="review-business-form" aria-label="分镜规划表单">
        <label className="review-business-form__wide">
          分镜叙事
          <textarea
            rows={3}
            value={form.narrative}
            onChange={(event) => update("narrative", event.target.value)}
          />
        </label>
        <label>
          总时长
          <input
            type="number"
            min={1}
            value={form.totalDurationSec}
            onChange={(event) => update("totalDurationSec", event.target.value)}
          />
        </label>
        <label>
          分镜假设
          <textarea
            rows={3}
            value={form.assumptions}
            onChange={(event) => update("assumptions", event.target.value)}
          />
        </label>
      </div>
      <div className="review-shot-form-list">
        {form.shots.map((shot, index) => (
          <fieldset key={index} className="review-shot-form">
            <legend>Shot {index + 1}</legend>
            <label>
              Shot {index + 1} 目的
              <select
                value={shot.purpose}
                onChange={(event) => updateShot(index, "purpose", event.target.value)}
              >
                <option value="hook">hook</option>
                <option value="benefit">benefit</option>
                <option value="proof">proof</option>
                <option value="cta">cta</option>
              </select>
            </label>
            <label>
              Shot {index + 1} 时长
              <input
                type="number"
                min={1}
                value={shot.durationSec}
                onChange={(event) => updateShot(index, "durationSec", event.target.value)}
              />
            </label>
            <label>
              Shot {index + 1} 场景
              <textarea
                rows={2}
                value={shot.scene}
                onChange={(event) => updateShot(index, "scene", event.target.value)}
              />
            </label>
            <label>
              Shot {index + 1} 画面方向
              <textarea
                rows={2}
                value={shot.visualDirection}
                onChange={(event) =>
                  updateShot(index, "visualDirection", event.target.value)
                }
              />
            </label>
            <label>
              Shot {index + 1} 素材 ref
              <input
                value={shot.productAssetRef}
                onChange={(event) =>
                  updateShot(index, "productAssetRef", event.target.value)
                }
              />
            </label>
            <label>
              Shot {index + 1} 转场
              <input
                value={shot.transition}
                onChange={(event) => updateShot(index, "transition", event.target.value)}
              />
            </label>
            <label className="review-business-form__wide">
              Shot {index + 1} 口播
              <textarea
                rows={2}
                value={shot.voiceover}
                onChange={(event) => updateShot(index, "voiceover", event.target.value)}
              />
            </label>
          </fieldset>
        ))}
      </div>
      <div className="review-panel__actions">
        <button type="button" className="review-secondary" onClick={submitForm}>
          <FileText size={16} />
          提交分镜规划到结构化内容
        </button>
        <span className="review-action-note">
          {submitted ? "表单内容已同步到后端 payload。" : "修改表单后，请先同步到 payload。"}
        </span>
      </div>
      <label className="review-payload-debug">
        <span>后端 payload（只读）</span>
        <textarea
          aria-label="后端 payload（只读）"
          readOnly
          value={JSON.stringify(draft, null, 2)}
        />
      </label>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          onClick={() => {
            onApprove(draft);
            onActionComplete();
          }}
          disabled={busy}
        >
          <CheckCircle2 size={16} />
          批准分镜规划并生成分镜生成要求
        </button>
      </div>
    </section>
  );
}

function StoryboardReview({
  vm,
  onActionComplete,
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const artifact = vm.artifacts.storyboard;
  if (!artifact) {
    return (
      <ProposalPlaceholder
        title="分镜规划"
        description="商品卖点批准后，生成视频叙事结构和镜头节奏。"
        actionLabel="生成分镜规划"
        busy={vm.busy}
        onAction={() => {
          vm.actions.proposeStoryboard();
          onActionComplete();
        }}
      />
    );
  }
  const storyboard = artifact.data;
  return (
    <StoryboardReviewForm
      artifactId={artifact.id}
      storyboard={storyboard}
      busy={vm.busy}
      onApprove={vm.actions.approveStoryboardAndProposeShotPrompt}
      onActionComplete={onActionComplete}
    />
  );
}

type ShotPromptShotFormState = {
  startSec: string;
  endSec: string;
  providerPrompt: string;
  referenceAssetRefs: string;
  voiceover: string;
};

type ShotPromptFormState = {
  durationSec: string;
  aspectRatio: ShotPromptArtifact["aspectRatio"];
  prompt: string;
  negativePrompt: string;
  ttsVoiceover: string;
  assumptions: string;
  shots: ShotPromptShotFormState[];
};

function shotPromptToForm(shotPrompt: ShotPromptArtifact): ShotPromptFormState {
  return {
    durationSec: String(shotPrompt.durationSec),
    aspectRatio: shotPrompt.aspectRatio,
    prompt: shotPrompt.prompt,
    negativePrompt: shotPrompt.negativePrompt,
    ttsVoiceover: shotPrompt.tts.voiceover,
    assumptions: shotPrompt.assumptions.join("\n"),
    shots: shotPrompt.shots.map((shot) => ({
      startSec: String(shot.startSec),
      endSec: String(shot.endSec),
      providerPrompt: shot.providerPrompt,
      referenceAssetRefs: shot.referenceAssetRefs.join("\n"),
      voiceover: shot.voiceover,
    })),
  };
}

function formToShotPrompt(
  form: ShotPromptFormState,
  current: ShotPromptArtifact,
): ShotPromptArtifact {
  return {
    ...current,
    durationSec: positiveIntegerFromText(form.durationSec, current.durationSec),
    aspectRatio: form.aspectRatio,
    prompt: form.prompt.trim(),
    negativePrompt: form.negativePrompt.trim(),
    tts: {
      ...current.tts,
      voiceover: form.ttsVoiceover.trim(),
    },
    assumptions: linesFromText(form.assumptions),
    shots: form.shots.map((shot, index) => {
      const currentShot = current.shots[index] ?? current.shots[0]!;
      return {
        ...currentShot,
        index: currentShot.index,
        startSec: nonNegativeIntegerFromText(shot.startSec, currentShot.startSec),
        endSec: positiveIntegerFromText(shot.endSec, currentShot.endSec),
        providerPrompt: shot.providerPrompt.trim(),
        referenceAssetRefs: linesFromText(shot.referenceAssetRefs),
        voiceover: shot.voiceover.trim(),
      };
    }),
  };
}

function ShotPromptReviewForm({
  artifactId,
  shotPrompt,
  busy,
  onApprove,
  onActionComplete,
}: {
  artifactId: string;
  shotPrompt: ShotPromptArtifact;
  busy: boolean;
  onApprove: (data: ShotPromptArtifact) => void;
  onActionComplete: () => void;
}) {
  const [form, setForm] = useState(() => shotPromptToForm(shotPrompt));
  const [draft, setDraft] = useState<ShotPromptArtifact>(shotPrompt);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setForm(shotPromptToForm(shotPrompt));
    setDraft(shotPrompt);
    setSubmitted(false);
  }, [artifactId, shotPrompt]);

  const update = (key: keyof Omit<ShotPromptFormState, "shots">, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitted(false);
  };

  const updateShot = (
    index: number,
    key: keyof ShotPromptShotFormState,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index ? { ...shot, [key]: value } : shot,
      ),
    }));
    setSubmitted(false);
  };

  const submitForm = () => {
    setDraft((current) => formToShotPrompt(form, current));
    setSubmitted(true);
  };

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>待审创作产物</span>
        <h1>分镜生成要求</h1>
        <p>确认逐 shot 的分镜图和分镜视频要求。批准后会自动创建分镜任务。</p>
      </div>
      <div className="review-business-form" aria-label="分镜生成要求表单">
        <label>
          总时长
          <input
            type="number"
            min={1}
            value={form.durationSec}
            onChange={(event) => update("durationSec", event.target.value)}
          />
        </label>
        <label>
          画幅
          <select
            value={form.aspectRatio}
            onChange={(event) =>
              update("aspectRatio", event.target.value as ShotPromptArtifact["aspectRatio"])
            }
          >
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
        <label className="review-business-form__wide">
          全局视频提示词
          <textarea
            rows={3}
            value={form.prompt}
            onChange={(event) => update("prompt", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          负向提示词
          <textarea
            rows={3}
            value={form.negativePrompt}
            onChange={(event) => update("negativePrompt", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          TTS 口播
          <textarea
            rows={3}
            value={form.ttsVoiceover}
            onChange={(event) => update("ttsVoiceover", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          生成要求假设
          <textarea
            rows={3}
            value={form.assumptions}
            onChange={(event) => update("assumptions", event.target.value)}
          />
        </label>
      </div>
      <div className="review-shot-form-list">
        {form.shots.map((shot, index) => (
          <fieldset key={index} className="review-shot-form">
            <legend>Shot {index + 1}</legend>
            <label>
              Shot {index + 1} 起始秒
              <input
                type="number"
                min={0}
                value={shot.startSec}
                onChange={(event) => updateShot(index, "startSec", event.target.value)}
              />
            </label>
            <label>
              Shot {index + 1} 结束秒
              <input
                type="number"
                min={1}
                value={shot.endSec}
                onChange={(event) => updateShot(index, "endSec", event.target.value)}
              />
            </label>
            <label className="review-business-form__wide">
              Shot {index + 1} 生成提示词
              <textarea
                rows={3}
                value={shot.providerPrompt}
                onChange={(event) =>
                  updateShot(index, "providerPrompt", event.target.value)
                }
              />
            </label>
            <label>
              Shot {index + 1} 参考素材
              <textarea
                rows={3}
                value={shot.referenceAssetRefs}
                onChange={(event) =>
                  updateShot(index, "referenceAssetRefs", event.target.value)
                }
              />
            </label>
            <label>
              Shot {index + 1} 口播
              <textarea
                rows={3}
                value={shot.voiceover}
                onChange={(event) => updateShot(index, "voiceover", event.target.value)}
              />
            </label>
          </fieldset>
        ))}
      </div>
      <div className="review-panel__actions">
        <button type="button" className="review-secondary" onClick={submitForm}>
          <FileText size={16} />
          提交分镜生成要求到结构化内容
        </button>
        <span className="review-action-note">
          {submitted ? "表单内容已同步到后端 payload。" : "修改表单后，请先同步到 payload。"}
        </span>
      </div>
      <label className="review-payload-debug">
        <span>后端 payload（只读）</span>
        <textarea
          aria-label="后端 payload（只读）"
          readOnly
          value={JSON.stringify(draft, null, 2)}
        />
      </label>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          onClick={() => {
            onApprove(draft);
            onActionComplete();
          }}
          disabled={busy}
        >
          <CheckCircle2 size={16} />
          批准分镜生成要求
        </button>
      </div>
    </section>
  );
}

function ShotPromptReview({
  vm,
  onActionComplete,
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const artifact = vm.artifacts.shotPrompt;
  if (!artifact) {
    return (
      <ProposalPlaceholder
        title="分镜生成要求"
        description="分镜规划批准后，生成每个 shot 的分镜图和分镜视频要求。"
        actionLabel="生成分镜生成要求"
        busy={vm.busy}
        onAction={() => {
          vm.actions.compileShotPrompt();
          onActionComplete();
        }}
      />
    );
  }
  const shotPrompt = artifact.data;
  if (artifact.isCurrent && !vm.workspaceStatus?.activeShotSet) {
    return (
      <ProposalPlaceholder
        title="分镜生成要求"
        description="已批准分镜生成要求，下一步创建当前分镜链路实例。"
        actionLabel="创建分镜任务"
        busy={vm.busy}
        onAction={() => {
          vm.actions.applyShotSet();
          onActionComplete();
        }}
      />
    );
  }
  return (
    <ShotPromptReviewForm
      artifactId={artifact.id}
      shotPrompt={shotPrompt}
      busy={vm.busy}
      onApprove={vm.actions.approveShotPromptAndApply}
      onActionComplete={onActionComplete}
    />
  );
}

function ImageSelectionPanel({
  vm,
  manualShotSelectionId,
  onAutoSelectShot,
  onImageSelectionConfirmed,
}: {
  vm: WorkbenchViewModel;
  manualShotSelectionId: string | null;
  onAutoSelectShot: (shotId: string) => void;
  onImageSelectionConfirmed: () => void;
}) {
  const nextImageShot = vm.shots.find((shot) => !shot.selectedImageId) ?? null;
  const shot = vm.selectedWorkflowShot ?? nextImageShot;
  const round = vm.latestImageRound;
  const batchId = round?.batch?.id ?? null;
  const mustSelectNext = nextImageShot && shot?.shotId !== nextImageShot.shotId;
  const selectedWasManual =
    manualShotSelectionId !== null && manualShotSelectionId === vm.selectedShotId;
  const canGenerate =
    shot !== null &&
    !mustSelectNext &&
    !shot.selectedImageId &&
    !["IMAGE_GENERATING", "IMAGE_PROMPT_PROPOSING"].includes(shot.status);

  useEffect(() => {
    if (
      nextImageShot &&
      (!vm.selectedShotId ||
        (!selectedWasManual && vm.selectedWorkflowShot?.selectedImageId))
    ) {
      onAutoSelectShot(nextImageShot.shotId);
    }
  }, [
    nextImageShot?.shotId,
    selectedWasManual,
    vm.selectedShotId,
    vm.selectedWorkflowShot?.selectedImageId,
  ]);

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>按 shot 顺序推进</span>
        <h1>分镜图选择</h1>
        <p>
          后一张分镜图会使用前一张 selected image 作为场景连续性锚点，所以这里不能并行生成。
        </p>
      </div>
      {!shot ? (
        <div className="review-empty-state">没有可生成的分镜图。</div>
      ) : (
        <>
          <div className="review-current-shot">
            <span>当前分镜</span>
            <strong>Shot {shot.orderIndex + 1}</strong>
            <em>{shot.status}</em>
          </div>
          {mustSelectNext && nextImageShot ? (
            <p className="review-warning">
              请先完成 Shot {nextImageShot.orderIndex + 1} 的分镜图选择。
            </p>
          ) : null}
          <div className="review-panel__actions">
            <button
              type="button"
              className="review-primary"
              disabled={vm.busy || !canGenerate}
              onClick={vm.actions.proposeImage}
            >
              <ImageIcon size={16} />
              生成分镜图候选
            </button>
          </div>
          {round ? (
            <CandidateImages
              key={shot.shotId}
              round={round}
              batchId={batchId}
              busy={vm.busy}
              onSelect={(candidateId, selectedBatchId) => {
                vm.actions.selectImageCandidate(candidateId, selectedBatchId);
                onImageSelectionConfirmed();
              }}
            />
          ) : (
            <div className="review-empty-state">
              <ImageIcon size={22} />
              <strong>当前 shot 还没有候选图。</strong>
              <span>生成后，选择一张作为 current image，再进入下一 shot。</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CandidateImages({
  round,
  batchId,
  busy,
  onSelect,
}: {
  round: NonNullable<WorkbenchViewModel["latestImageRound"]>;
  batchId: string | null;
  busy: boolean;
  onSelect: (candidateId: string, batchId: string) => void;
}) {
  const committedId = round.selection?.selectedCandidateId ?? null;
  const [stagedId, setStagedId] = useState<string | null>(committedId);
  useEffect(() => {
    setStagedId(committedId);
  }, [committedId]);

  const confirmEnabled =
    Boolean(batchId) && canConfirmSelection({ stagedId, committedId, busy });

  const confirmNote = committedId
    ? stagedId === committedId
      ? "已确认当前分镜图，点选其他候选可改选。"
      : "已选中新候选，点击确认以更新当前分镜图。"
    : stagedId
      ? "点击确认以选定当前分镜图。"
      : "先点选一张成功生成的候选图，再确认。";

  return (
    <div className="review-round">
      <div className="review-round__head">
        <span className={`review-status review-status--${statusTone(round.batch?.status)}`}>
          {round.batch?.status ?? "等待"}
        </span>
        <span>
          {round.batch?.succeededCount ?? 0}/{round.batch?.requestedCount ?? round.candidates.length}
        </span>
      </div>
      <div className="review-image-grid">
        {round.candidates.map((candidate) => {
          const isStaged = candidate.id === stagedId;
          const isCommitted = candidate.id === committedId;
          return (
            <button
              key={candidate.id}
              type="button"
              disabled={busy || !isSelectableCandidate(candidate.status)}
              aria-pressed={isStaged}
              className={[
                "review-candidate",
                `review-candidate--${statusTone(candidate.status)}`,
                isStaged ? "review-candidate--staged" : "",
                isCommitted ? "review-candidate--committed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                setStagedId((current) =>
                  stageCandidate(current, candidate.id, round.candidates),
                )
              }
            >
              {candidate.imageUrl ? (
                <img src={toAbsoluteAssetUrl(candidate.imageUrl)} alt={candidate.id} />
              ) : (
                <span>{candidate.errorMessage ?? candidate.status}</span>
              )}
              {isCommitted ? (
                <span className="review-candidate__badge">当前选择</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={!confirmEnabled}
          onClick={() => {
            if (batchId && stagedId) onSelect(stagedId, batchId);
          }}
        >
          <CheckCircle2 size={16} />
          确认选择
        </button>
        <span className="review-action-note">{confirmNote}</span>
      </div>
    </div>
  );
}

function VideoSelectionPanel({ vm }: { vm: WorkbenchViewModel }) {
  const allImagesSelected =
    vm.shots.length > 0 && vm.shots.every((shot) => Boolean(shot.selectedImageId));
  const videoTargets = vm.shots.filter(
    (shot) => shot.selectedImageId && !shot.selectedVideoId && !shot.activeVideoBatchId,
  );
  const round = vm.latestVideoRound;
  const batchId = round?.batch?.id ?? null;

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>批量生成，逐 shot 审核</span>
        <h1>分镜视频选择</h1>
        <p>
          全部分镜图选择完成后，批量生成视频候选；用户仍然逐个 shot 选择 current video。
        </p>
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || !allImagesSelected || videoTargets.length === 0}
          onClick={vm.actions.proposeAllVideos}
        >
          <Film size={16} />
          批量生成分镜视频候选
        </button>
        <span className="review-action-note">
          {videoTargets.length > 0
            ? `待生成 ${videoTargets.length} 个 shot`
            : "已有视频候选或已完成选择"}
        </span>
      </div>
      {vm.selectedWorkflowShot ? (
        <div className="review-current-shot">
          <span>当前审核</span>
          <strong>Shot {vm.selectedWorkflowShot.orderIndex + 1}</strong>
          <em>{vm.selectedWorkflowShot.status}</em>
        </div>
      ) : null}
      {round ? (
        <CandidateVideos
          round={round}
          batchId={batchId}
          busy={vm.busy}
          onSelect={vm.actions.selectVideoCandidate}
        />
      ) : (
        <div className="review-empty-state">
          <Film size={22} />
          <strong>当前 shot 还没有视频候选。</strong>
          <span>批量生成完成后，在左侧切换 shot 逐个审核。</span>
        </div>
      )}
    </section>
  );
}

function CandidateVideos({
  round,
  batchId,
  busy,
  onSelect,
}: {
  round: NonNullable<WorkbenchViewModel["latestVideoRound"]>;
  batchId: string | null;
  busy: boolean;
  onSelect: (candidateId: string, batchId: string) => void;
}) {
  return (
    <div className="review-round">
      <div className="review-round__head">
        <span className={`review-status review-status--${statusTone(round.batch?.status)}`}>
          {round.batch?.status ?? "等待"}
        </span>
        <span>
          {round.batch?.succeededCount ?? 0}/{round.batch?.requestedCount ?? round.candidates.length}
        </span>
      </div>
      <div className="review-video-grid">
        {round.candidates.map((candidate) => (
          <div
            key={candidate.id}
            className={`review-video-candidate review-candidate--${statusTone(candidate.status)}`}
          >
            {candidate.videoUrl ? (
              <video src={toAbsoluteAssetUrl(candidate.videoUrl)} controls preload="metadata" />
            ) : (
              <span>{candidate.errorMessage ?? candidate.status}</span>
            )}
            <button
              type="button"
              disabled={busy || !batchId || candidate.status !== "SUCCEEDED"}
              onClick={() => batchId && onSelect(candidate.id, batchId)}
            >
              选择为当前分镜视频
            </button>
          </div>
        ))}
      </div>
      {!isTerminalReady(round.batch?.status) ? <div className="review-progress" /> : null}
    </div>
  );
}

function FinalPanel({ vm }: { vm: WorkbenchViewModel }) {
  const job = vm.finalVideo;
  const finalUrl = job?.localUrl ? toAbsoluteAssetUrl(job.localUrl) : null;
  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>用户手动触发</span>
        <h1>生成成片</h1>
        <p>全部分镜视频确认后，再由用户明确点击生成成片。</p>
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || !vm.workflow?.canComposeFinalVideo}
          onClick={vm.actions.composeFinal}
        >
          <Play size={16} />
          生成成片
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
              <a className="download-link" href={finalUrl} download>
                <Download size={14} />
                下载 MP4
              </a>
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

function MainPanel({
  vm,
  active,
  onActionComplete,
  manualShotSelectionId,
  onAutoSelectShot,
  onImageSelectionConfirmed,
}: {
  vm: WorkbenchViewModel;
  active: ReviewStepId;
  onActionComplete: () => void;
  manualShotSelectionId: string | null;
  onAutoSelectShot: (shotId: string) => void;
  onImageSelectionConfirmed: () => void;
}) {
  switch (active) {
    case "requirements":
      return <RequirementsStart vm={vm} onActionComplete={onActionComplete} />;
    case "brief":
      return <ProductBriefReview vm={vm} onActionComplete={onActionComplete} />;
    case "storyboard":
      return <StoryboardReview vm={vm} onActionComplete={onActionComplete} />;
    case "shotprompt":
      return <ShotPromptReview vm={vm} onActionComplete={onActionComplete} />;
    case "image":
      return (
        <ImageSelectionPanel
          vm={vm}
          manualShotSelectionId={manualShotSelectionId}
          onAutoSelectShot={onAutoSelectShot}
          onImageSelectionConfirmed={onImageSelectionConfirmed}
        />
      );
    case "video":
      return <VideoSelectionPanel vm={vm} />;
    case "final":
      return <FinalPanel vm={vm} />;
  }
}

export function CreativeReviewDesk({ workspaceId }: { workspaceId: string }) {
  const vm = useWorkbenchViewModel(workspaceId);
  const defaultStep = deriveActiveStep(vm);
  const [selectedStep, setSelectedStep] = useState<ReviewStepId | null>(null);
  const [manualShotSelectionId, setManualShotSelectionId] = useState<string | null>(
    null,
  );
  const active = selectedStep ?? defaultStep;

  useEffect(() => {
    if (selectedStep && !canOpenReviewStep(vm, selectedStep, defaultStep)) {
      setSelectedStep(null);
    }
  }, [
    defaultStep,
    selectedStep,
    vm.artifacts.brief?.id,
    vm.artifacts.promptRequirements?.id,
    vm.artifacts.shotPrompt?.id,
    vm.artifacts.storyboard?.id,
    vm.shots.length,
    vm.workspaceStatus?.activeShotSet?.id,
    vm.workflow?.canComposeFinalVideo,
  ]);

  return (
    <div className="review-desk">
      <header className="review-topbar">
        <button type="button" className="review-icon-button" onClick={backToWorkspaces} title="返回工作区">
          <ArrowLeft size={18} />
        </button>
        <div className="review-topbar__title">
          <span>创作工作目录</span>
          <strong>{vm.workspace?.localPath ?? vm.workspaceId}</strong>
        </div>
        <button
          type="button"
          className="review-icon-button"
          onClick={() => void vm.actions.refresh()}
          title="刷新"
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {vm.error ? <div className="review-global-error">{vm.error}</div> : null}
      {vm.loading ? (
        <div className="review-loading">
          <div />
          <div />
          <div />
        </div>
      ) : (
        <main className="review-grid">
          <StepRail
            vm={vm}
            active={active}
            defaultStep={defaultStep}
            onSelect={setSelectedStep}
            onShotSelect={(shotId) => {
              setManualShotSelectionId(shotId);
              vm.actions.setSelectedShotId(shotId);
            }}
          />
          <MainPanel
            vm={vm}
            active={active}
            onActionComplete={() => setSelectedStep(null)}
            manualShotSelectionId={manualShotSelectionId}
            onAutoSelectShot={(shotId) => {
              setManualShotSelectionId(null);
              vm.actions.setSelectedShotId(shotId);
            }}
            onImageSelectionConfirmed={() => setManualShotSelectionId(null)}
          />
          <RightRail vm={vm} />
        </main>
      )}
      {vm.busy || vm.refreshing || vm.hasActiveGeneration ? (
        <div className="review-live-strip">
          <span />
          正在同步创作状态
        </div>
      ) : null}
    </div>
  );
}
