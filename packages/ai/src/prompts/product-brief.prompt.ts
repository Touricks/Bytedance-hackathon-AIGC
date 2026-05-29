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
          id: "angle_selection",
          label: "角度选择",
          body: "根据商品卖点和目标人群选择最适合抖音带货的 angleType（只选一个）：problem_solution 适合有明确痛点的商品；before_after 适合使用前后反差明显的商品；lifestyle_upgrade 适合提升生活品质类商品；trust_proof 适合强调品质安全保证的商品；budget_value 适合性价比是第一购买动机的商品。emotionalTrigger 用一句中文写出目标人群最容易被触动的情绪锚点。conversionStyle 根据商品决策难度选择：低价冲动品用 direct_cta，高单价用 soft_cta，创作者人设强用 personal_recommendation，先痛点再方案用 problem_triggered_cta。",
        },
        {
          id: "output_contract",
          label: "输出契约",
          body: "返回严格 JSON，包含 product、audience、coreSellingPoint、proof、offer、platform、brandTone、bannedExpressions、landingInfo、assumptions、angleType、emotionalTrigger 和 conversionStyle。",
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
    "角度选择（必填）：",
    "根据商品卖点和目标人群，选择最适合抖音带货的单一 angleType：",
    "- problem_solution：商品能解决目标人群的明确日常痛点",
    "- before_after：使用前后效果反差明显，画面对比是最强说服力",
    "- lifestyle_upgrade：商品让生活变得更好，情感认同驱动购买",
    "- trust_proof：品质保证、安全背书是核心说服逻辑",
    "- budget_value：价格冲击力是第一购买动机",
    "emotionalTrigger：用一句中文写出目标人群最容易被触动的情绪锚点，",
    "例如：「每次清洁都费劲的那种无力感」「想犒劳自己却不知道买什么」",
    "conversionStyle：",
    "- soft_cta：高单价或需要信任积累的商品",
    "- direct_cta：低价冲动消费品",
    "- personal_recommendation：创作者人设感强的商品",
    "- problem_triggered_cta：先说痛点再给解决方案效果更好的商品",
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
      angleType: "problem_solution | before_after | lifestyle_upgrade | trust_proof | budget_value",
      emotionalTrigger: "一句中文情绪锚点",
      conversionStyle: "soft_cta | direct_cta | personal_recommendation | problem_triggered_cta",
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
