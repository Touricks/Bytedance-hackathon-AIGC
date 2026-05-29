import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const STORYBOARD_VARIANTS_PROMPT_VERSION = "storyboard-variants.v1";

export interface BuildStoryboardVariantsPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  variantCount?: 2 | 3;
}

export interface BuildStoryboardVariantsPromptViewInput
  extends BuildStoryboardVariantsPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function materialSummary(material: MaterialIntakeArtifact) {
  return material.assets
    .filter((a) => a.included)
    .map((a) => `${a.ref} (${a.kind}, ${a.role}): ${a.description}`)
    .join("\n");
}

const VARIANT_COMBINATIONS: Array<{
  variantLabel: string;
  templateStyle: string;
  angleType: string;
  styleNote: string;
}> = [
  {
    variantLabel: "种草风",
    templateStyle: "种草",
    angleType: "lifestyle_upgrade",
    styleNote: "真实用户安利语气，像朋友分享，强调使用体验和生活融入感",
  },
  {
    variantLabel: "痛点风",
    templateStyle: "卖点",
    angleType: "problem_solution",
    styleNote: "开门见山说痛点，直击目标人群最难受的日常问题，商品是解决方案",
  },
  {
    variantLabel: "开箱风",
    templateStyle: "开箱",
    angleType: "trust_proof",
    styleNote: "以拆开包装/初次接触为主线，用细节和质感建立信任，主打第一印象惊喜",
  },
];

export function buildStoryboardVariantsPromptView(
  input: BuildStoryboardVariantsPromptViewInput,
): RuntimePromptView {
  const count = input.variantCount ?? 3;
  const variants = VARIANT_COMBINATIONS.slice(0, count);
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "多候选分镜生成提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body: `你是电商分镜策略师，一次为同一商品生成 ${count} 套风格明显不同的分镜候选，供商家选择最适合的一套继续生成视频。`,
        },
        {
          id: "product",
          label: "商品信息",
          body: `${input.brief.product.name}：${input.brief.coreSellingPoint}。目标人群：${input.brief.audience.who}。`,
        },
        {
          id: "variants_plan",
          label: "候选风格计划",
          body: variants
            .map((v, i) => `变体 ${i + 1}：${v.variantLabel}（${v.styleNote}）`)
            .join("\n"),
        },
        {
          id: "output_contract",
          label: "输出契约",
          body: `返回包含 ${count} 个变体的 variants 数组，每个变体有独立的 variantLabel、templateStyle、angleType、narrative、shots 和 sellingReason。`,
        },
      ],
    },
    variables: {
      productName: input.brief.product.name,
      variantCount: count,
      variantLabels: variants.map((v) => v.variantLabel),
      materialRefs: input.material.assets.filter((a) => a.included).map((a) => a.ref),
    },
  };
}

export function buildStoryboardVariantsPrompt(
  input: BuildStoryboardVariantsPromptInput,
): string {
  const count = input.variantCount ?? 3;
  const variants = VARIANT_COMBINATIONS.slice(0, count);
  const refs = input.material.assets
    .filter((a) => a.included)
    .map((a) => a.ref);
  const primaryRef = input.material.primaryProductRef;

  return [
    "角色：",
    `你是电商分镜策略师。为同一商品一次生成 ${count} 套风格明显不同的 12 秒分镜候选，供商家选择。`,
    "",
    "商品信息：",
    `商品名称：${input.brief.product.name}`,
    `核心卖点：${input.brief.coreSellingPoint}`,
    `目标人群：${input.brief.audience.who}，${input.brief.audience.painOrDesire}`,
    `品牌语气：${input.brief.brandTone}`,
    `主商品素材 ref：${primaryRef}`,
    "可用素材清单：",
    materialSummary(input.material),
    "",
    "已确认商品 brief（完整）：",
    JSON.stringify(input.brief),
    "",
    `任务：生成以下 ${count} 套分镜变体，每套必须风格鲜明、彼此有明显差异：`,
    ...variants.map(
      (v, i) =>
        `变体 ${i + 1}：variantLabel="${v.variantLabel}"，templateStyle="${v.templateStyle}"，angleType="${v.angleType}"。风格要求：${v.styleNote}`,
    ),
    "",
    "每套变体都必须：",
    "- 严格按 6 段时间线生成 shots：hook(0-2s) + benefit(2-5s) + benefit(5-8s) + proof(8-10s) + proof(10-11s) + cta(11-12s)",
    "- shots[].purpose 只能是 hook / benefit / proof / cta",
    `- shots[].productAssetRef 只能使用以下 ref：${refs.join("、")}`,
    "- voiceover 不超过 15 字，口语化，禁止广告体",
    "- scene 写具体地点+光线，不超过 20 字，禁止抽象描述",
    "- visualDirection 写镜头类型（特写/中景/全景）+ 运动方式",
    "- sellingReason：一句话说明这套风格为什么适合本商品和目标人群",
    "- 三套变体的叙事、Hook 手法、情绪路径必须明显不同，不要只是换词",
    "",
    "输出：",
    "返回严格 JSON，不要包含 Markdown。结构契约由 Ark response_format 强制约束。",
    "禁止输出占位符（字符串、TODO、N/A、待补充）。",
  ].join("\n");
}
