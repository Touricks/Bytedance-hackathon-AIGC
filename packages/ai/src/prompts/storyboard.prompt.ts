import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const STORYBOARD_PROMPT_VERSION = "ugc-storyboard.v1";

export interface BuildStoryboardPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
}

export interface BuildStoryboardPromptViewInput extends BuildStoryboardPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function storyboardMaterialSummary(input: MaterialIntakeArtifact) {
  return input.assets
    .filter((asset) => asset.included)
    .map(
      (asset) =>
        `${asset.ref} (${asset.kind}, ${asset.role}): ${asset.description}`,
    )
    .join("\n");
}

export function buildStoryboardPromptView(
  input: BuildStoryboardPromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "口播分镜提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body: "你是电商口播分镜构建器。请把一份已确认商品 brief 转成商家可编辑的短视频分镜。",
        },
        {
          id: "approved_brief",
          label: "已确认商品 brief",
          body: `${input.brief.product.name}：${input.brief.coreSellingPoint}。目标人群：${input.brief.audience.who}。语气：${input.brief.brandTone}。`,
        },
        {
          id: "approved_material",
          label: "已确认素材",
          body:
            storyboardMaterialSummary(input.material) ||
            "没有可纳入生成的素材。",
        },
        {
          id: "task",
          label: "任务",
          body: "生成一条 12 秒电商口播风格分镜。保留唯一核心卖点。每个 shot 的 purpose 必须是 hook、benefit、proof 或 cta；productAssetRef 必须是已确认素材清单中的非空 ref。",
        },
        {
          id: "output_contract",
          label: "输出契约",
          body: "返回严格 JSON，包含 narrative、totalDurationSec、shots 和 assumptions。每个 shot 包含 purpose、durationSec、scene、visualDirection、productAssetRef、voiceover 和 transition。不要要求生成视频里出现可读文字。",
        },
      ],
    },
    variables: {
      productName: input.brief.product.name,
      coreSellingPoint: input.brief.coreSellingPoint,
      audience: input.brief.audience.who,
      materialRefs: input.material.assets
        .filter((asset) => asset.included)
        .map((asset) => asset.ref),
    },
  };
}

export function buildStoryboardPrompt(input: BuildStoryboardPromptInput) {
  return [
    "角色：",
    "你是电商口播分镜构建器。你要把一份已确认商品 brief 转成商家可编辑的短视频分镜。",
    "",
    "输入：",
    "已确认商品 brief：",
    JSON.stringify(input.brief),
    "已确认素材清单：",
    JSON.stringify(input.material.assets),
    "",
    "任务：",
    "只生成一条电商短视频分镜。",
    "忠实保留 brief 中唯一的 coreSellingPoint，不要引入新的商品主张。",
    "每个 shots[].purpose 必须严格是 hook、benefit、proof、cta 之一，不要使用自然语言目的标签。",
    "每个 shots[].productAssetRef 必须是已确认素材清单中的非空 ref。",
    "productAssetRef 只能使用已确认素材清单里的值。",
    "如果只有一个纳入生成的素材 ref，每个 shot 都使用该 ref。",
    "为每个 shot 写自然的创作者口播。",
    "不要要求生成视频里出现可读文字。",
    "不要写 Seedance 图生视频提示词或最终 provider prompt 字符串。",
    "",
    "输出：",
    "返回严格 JSON，匹配以下结构，不要包含 Markdown：",
    JSON.stringify({
      narrative: "字符串",
      totalDurationSec: 12,
      shots: [
        {
          index: 0,
          purpose: "hook",
          durationSec: 3,
          scene: "字符串",
          visualDirection: "字符串",
          productAssetRef: "product.png",
          voiceover: "字符串",
          transition: "cut",
        },
      ],
      assumptions: ["字符串"],
    }),
  ].join("\n");
}
