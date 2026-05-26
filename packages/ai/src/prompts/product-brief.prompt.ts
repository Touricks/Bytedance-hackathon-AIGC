import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const PRODUCT_BRIEF_PROMPT_VERSION = "product-brief.v1";

export interface BuildProductBriefPromptInput {
  userDirection?: string;
  title?: string;
  sellingPoints?: string;
  audience?: string;
  stylePreference?: string;
  material: MaterialIntakeArtifact;
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
          body:
            input.userDirection?.trim() ||
            "未提供额外商品方向。",
        },
        {
          id: "legacy_seed",
          label: "可选预填字段",
          body: legacySeed(input),
        },
        {
          id: "approved_material",
          label: "已确认素材",
          body:
            summarizeMaterial(input.material) ||
            "没有可纳入生成的素材。",
        },
        {
          id: "task",
          label: "任务",
          body: "基于已确认素材推断一份简洁商品 brief。只选择一个核心卖点；没有输入依据的结论必须写入 assumptions。",
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
    },
  };
}

export function buildProductBriefPrompt(input: BuildProductBriefPromptInput) {
  return [
    "角色：",
    "你是电商商品简报构建器。你要生成商家可编辑的商品 brief，不要生成开场钩子、分镜或最终视频提示词。",
    "",
    "输入：",
    `用户方向：${input.userDirection ?? "未指定"}`,
    legacySeed(input),
    `主商品素材 ref：${input.material.primaryProductRef}`,
    "可用素材清单：",
    JSON.stringify(input.material.assets),
    "",
    "任务：",
    "为一条电商短视频生成一份简洁商品 brief。",
    "只选择一个 coreSellingPoint。",
    "product.assets 中的 ref 只能来自素材清单。",
    "不要写开场钩子、分镜节拍、口播、CTA 文案或图生视频提示词。",
    "如果事实没有被输入直接支持，必须写入 assumptions。",
    "",
    "输出：",
    "返回严格 JSON，匹配以下结构，不要包含 Markdown：",
    JSON.stringify({
      product: {
        name: "字符串",
        category: "字符串",
        keyFacts: ["字符串"],
        assets: [{ ref: "product.png", useAs: "primary | support" }],
      },
      audience: {
        who: "字符串",
        painOrDesire: "字符串",
      },
      coreSellingPoint: "单个字符串",
      proof: ["字符串"],
      offer: null,
      platform: "Seedance",
      brandTone: "字符串",
      bannedExpressions: ["字符串"],
      landingInfo: null,
      assumptions: ["字符串"],
    }),
  ].join("\n");
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
