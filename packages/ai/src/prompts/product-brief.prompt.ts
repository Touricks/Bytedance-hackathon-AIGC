import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";
import { buildModulePrompt } from "./module-prompt-assembler.js";

export const PRODUCT_BRIEF_PROMPT_VERSION = "product-brief.v1";

export interface BuildProductBriefPromptInput {
  userDirection?: string;
  title?: string;
  sellingPoints?: string;
  audience?: string;
  stylePreference?: string;
  material: MaterialIntakeArtifact;
  draft?: ProductBriefArtifact;
}

export interface BuildProductBriefPromptViewInput extends BuildProductBriefPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function summarizeMaterial(input: MaterialIntakeArtifact) {
  return input.assets
    .filter((asset) => asset.included)
    .map(
      (asset) =>
        `${asset.ref} (${asset.kind}, ${asset.role}, ${asset.relevance}): ${asset.description}`,
    )
    .join("\n");
}

function legacySeed(input: BuildProductBriefPromptInput) {
  const lines = [
    input.title ? `商品标题：${input.title}` : "",
    input.sellingPoints ? `卖点：${input.sellingPoints}` : "",
    input.audience ? `目标人群：${input.audience}` : "",
    input.stylePreference ? `风格偏好：${input.stylePreference}` : "",
  ].filter(Boolean);

  return lines.length ? lines.join("\n") : "未提供预填表单字段。";
}

function summarizeDraft(input: ProductBriefArtifact | undefined) {
  if (!input) return "未提供当前商品卖点草稿。";
  return JSON.stringify(
    {
      product: input.product,
      audience: input.audience,
      coreSellingPoint: input.coreSellingPoint,
      proof: input.proof,
      offer: input.offer,
      platform: input.platform,
      brandTone: input.brandTone,
      bannedExpressions: input.bannedExpressions,
      landingInfo: input.landingInfo,
      assumptions: input.assumptions,
    },
    null,
    2,
  );
}

function productBriefTaskMode(input: BuildProductBriefPromptInput) {
  return input.draft?.product && input.userDirection?.trim()
    ? "调整商品卖点"
    : "首次生成商品卖点";
}

function rewriteGuidance(input: BuildProductBriefPromptInput) {
  if (!input.draft) {
    return "无当前商品卖点草稿。请基于已确认素材生成一份新的待审商品卖点。";
  }
  if (!input.userDirection?.trim()) {
    return "已提供当前商品卖点草稿，但没有额外调整方向。请保持结构完整，并只在素材事实明确支持时优化表达。";
  }
  return [
    "本次是按商家自然语言调整当前商品卖点草稿。",
    "用户方向是本轮最高优先级，当前草稿只是待改写基线。",
    "如果用户方向声明新的商品主体、品类、服务类型、目标人群、卖点重点或语气，必须重写受影响字段，尤其是 product.name、product.category、audience、coreSellingPoint、proof 和 assumptions。",
    "用户方向与当前草稿冲突时，以用户方向为准；不得原样返回当前草稿中的旧商品主体、旧品类或旧核心卖点。",
    "如果用户方向提供了素材中看不到但业务上必要的信息，把它作为商家输入的业务事实使用，并在 assumptions 中标明该信息来自商家补充。",
  ].join("\n");
}

export function buildProductBriefPromptView(
  input: BuildProductBriefPromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "商品简报提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body: "你是电商商品简报构建器。请生成商家可编辑的商品 brief，不要生成开场钩子、分镜或最终视频提示词。",
        },
        {
          id: "user_direction",
          label: "用户方向",
          body: input.userDirection?.trim() || "未提供额外商品方向。",
        },
        {
          id: "legacy_seed",
          label: "可选预填字段",
          body: legacySeed(input),
        },
        {
          id: "merchant_draft",
          label: "当前商品卖点草稿",
          body: summarizeDraft(input.draft),
        },
        {
          id: "approved_material",
          label: "已确认素材",
          body: summarizeMaterial(input.material) || "没有可纳入生成的素材。",
        },
        {
          id: "task",
          label: "任务",
          body: rewriteGuidance(input),
        },
        {
          id: "output_contract",
          label: "输出契约",
          body: "返回严格 JSON，包含 product、audience、coreSellingPoint、proof、offer、platform、brandTone、bannedExpressions、landingInfo 和 assumptions。",
        },
      ],
    },
    variables: {
      userDirection: input.userDirection ?? null,
      primaryProductRef: input.material.primaryProductRef,
      materialRefs: input.material.assets
        .filter((asset) => asset.included)
        .map((asset) => asset.ref),
      legacySeed: {
        title: input.title ?? null,
        sellingPoints: input.sellingPoints ?? null,
        audience: input.audience ?? null,
        stylePreference: input.stylePreference ?? null,
      },
      draft: input.draft ?? null,
    },
  };
}

export function buildProductBriefPrompt(input: BuildProductBriefPromptInput) {
  return buildModulePrompt({
    moduleId: "product-brief",
    runtimeContext: [
      "输入：",
      `本次任务模式：${productBriefTaskMode(input)}`,
      `用户方向：${input.userDirection ?? "未指定"}`,
      legacySeed(input),
      "改写规则：",
      rewriteGuidance(input),
      "当前商品卖点草稿：",
      summarizeDraft(input.draft),
      `主商品素材 ref：${input.material.primaryProductRef}`,
      "可用素材清单：",
      JSON.stringify(input.material.assets),
    ].join("\n"),
  }).prompt;
}

export function buildProductBriefRepairPrompt(rawOutput: string) {
  return [
    "请把以下模型输出修复为符合商品 brief schema 的严格 JSON。",
    "必须只保留一个 coreSellingPoint 字符串。",
    "不要添加开场钩子、分镜节拍、口播、CTA 文案或图生视频提示词。",
    "不要包含 Markdown。",
    "",
    rawOutput,
  ].join("\n");
}
