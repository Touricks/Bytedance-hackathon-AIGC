import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";
import { formatCreativeRequirementsForModule } from "./creative-requirements-context.js";
import { buildModulePrompt } from "./module-prompt-assembler.js";

export const STORYBOARD_PROMPT_VERSION = "ugc-storyboard.v1";

export interface BuildStoryboardPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  creativeRequirements?: unknown;
}

export interface BuildStoryboardVoiceoverRewritePromptInput
  extends BuildStoryboardPromptInput {
  storyboard: StoryboardArtifact;
  userDirection?: string;
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
  const creativeRequirements = formatCreativeRequirementsForModule(
    input.creativeRequirements,
    "storyboard",
  );
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
        ...(creativeRequirements
          ? [
              {
                id: "creative_requirements",
                label: "全局创作要求",
                body: creativeRequirements,
              },
            ]
          : []),
        {
          id: "task",
          label: "任务",
          body: "生成一条 15 秒电商口播风格分镜。固定 3 镜，purpose 按顺序是 hook、proof、cta，durationSec 按顺序是 4、7、4。保留唯一核心卖点；productAssetRef 必须是已确认素材清单中的非空 ref；每段口播有效字数不超过 durationSec * 5。",
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
  const creativeRequirements = formatCreativeRequirementsForModule(
    input.creativeRequirements,
    "storyboard",
  );
  return buildModulePrompt({
    moduleId: "storyboard",
    runtimeContext: [
      creativeRequirements,
      "输入：",
      "已确认商品 brief：",
      JSON.stringify(input.brief),
      "已确认素材清单：",
      JSON.stringify(input.material.assets),
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n"),
  }).prompt;
}

export function buildStoryboardVoiceoverRewritePrompt(
  input: BuildStoryboardVoiceoverRewritePromptInput,
) {
  const creativeRequirements = formatCreativeRequirementsForModule(
    input.creativeRequirements,
    "storyboard",
  );
  return buildModulePrompt({
    moduleId: "storyboard",
    runtimeContext: [
      creativeRequirements,
      "任务：只重写分镜脚本中的 shots[].voiceover。",
      "边界：不得改变 narrative、totalDurationSec、shots 数量、index、purpose、durationSec、scene、visualDirection、productAssetRef、transition。",
      "节奏约束：每段口播有效字数必须小于等于 durationSec * 5。",
      "风格：用商家能直接审核的中文电商口播，避免夸大宣称和不可验证承诺。",
      input.userDirection?.trim()
        ? `用户补充要求：${input.userDirection.trim()}`
        : "用户补充要求：无。",
      "已确认商品 brief：",
      JSON.stringify(input.brief),
      "已确认素材解读：",
      JSON.stringify(input.material),
      "当前分镜脚本：",
      JSON.stringify(input.storyboard),
      "输出严格 JSON：{\"shots\":[{\"index\":0,\"voiceover\":\"...\"}]}。",
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n"),
  }).prompt;
}
