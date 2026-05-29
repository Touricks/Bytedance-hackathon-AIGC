import type {
  ProductBriefArtifact,
  ShotPromptArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const FEEDBACK_ROUTE_PROMPT_VERSION = "feedback-route.v1";

export interface BuildFeedbackRoutePromptInput {
  feedback: string;
  brief: ProductBriefArtifact;
  storyboard: StoryboardArtifact;
  shotPrompt: ShotPromptArtifact;
}

export interface BuildFeedbackRoutePromptViewInput
  extends BuildFeedbackRoutePromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function summarizeBrief(brief: ProductBriefArtifact) {
  return {
    product: brief.product,
    audience: brief.audience,
    coreSellingPoint: brief.coreSellingPoint,
    brandTone: brief.brandTone,
    bannedExpressions: brief.bannedExpressions,
  };
}

function summarizeStoryboard(storyboard: StoryboardArtifact) {
  return {
    narrative: storyboard.narrative,
    totalDurationSec: storyboard.totalDurationSec,
    shots: storyboard.shots.map((shot) => ({
      index: shot.index,
      purpose: shot.purpose,
      scene: shot.scene,
      visualDirection: shot.visualDirection,
      voiceover: shot.voiceover,
      transition: shot.transition,
    })),
  };
}

function summarizeShotPrompt(shotPrompt: ShotPromptArtifact) {
  return {
    durationSec: shotPrompt.durationSec,
    aspectRatio: shotPrompt.aspectRatio,
    prompt: shotPrompt.prompt,
    negativePrompt: shotPrompt.negativePrompt,
    shots: shotPrompt.shots.map((shot) => ({
      index: shot.index,
      startSec: shot.startSec,
      endSec: shot.endSec,
      providerPrompt: shot.providerPrompt,
      referenceAssetRefs: shot.referenceAssetRefs,
      voiceover: shot.voiceover,
    })),
  };
}

export function buildFeedbackRoutePromptView(
  input: BuildFeedbackRoutePromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "成片反馈路由提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body: "判断用户对成片的反馈应该回到商品 brief、UGC 分镜还是视频剧本。只输出路由决策，不直接改写 artifact。",
        },
        {
          id: "feedback",
          label: "用户反馈",
          body: input.feedback,
        },
        {
          id: "routing_policy",
          label: "路由原则",
          body: "商品定位、受众、卖点、品牌语气、切入角度/策略方向（angleType）问题回到 brief；口播、Hook、叙事节奏、CTA 问题回到 storyboard；商品保真、镜头运动、演示动作、时长、负向约束问题回到 shotprompt。",
        },
      ],
    },
    variables: {
      feedback: input.feedback,
      briefProduct: input.brief.product.name,
      storyboardShotCount: input.storyboard.shots.length,
      shotPromptShotCount: input.shotPrompt.shots.length,
    },
  };
}

export function buildFeedbackRoutePrompt(input: BuildFeedbackRoutePromptInput) {
  return [
    "角色：",
    "你是成片反馈路由器。你只判断用户反馈应该回到哪个已批准 artifact，不直接改写 brief、storyboard 或 shotprompt。",
    "",
    "路由分类：",
    "1. 回到 brief：卖点选错、受众不对、痛点不准、价格优惠、平台、品牌语气、踩禁用词；",
    "   以及：视频切入角度不对、策略方向有问题、风格定位偏差（对应修改 brief.angleType）。",
    "2. 回到 storyboard：创作者角色不合、口播不像真人、Hook 不抓人、脚本节奏、CTA 软硬、字幕或口播文案问题。",
    "3. 回到 shotprompt：商品不像原图、镜头运动、商品运动、演示动作、时长、结尾定格、负向约束或画面违规。",
    "反馈含多类问题时，选择最上游的 artifact，避免下游修改被上游重生成覆盖。",
    "",
    "用户成片反馈：",
    input.feedback,
    "",
    "当前 brief 摘要：",
    JSON.stringify(summarizeBrief(input.brief)),
    "",
    "当前 storyboard 摘要：",
    JSON.stringify(summarizeStoryboard(input.storyboard)),
    "",
    "当前 shotprompt 摘要：",
    JSON.stringify(summarizeShotPrompt(input.shotPrompt)),
    "",
    "输出要求：",
    "返回严格 JSON，不要包含 Markdown。",
    "reason 和 revisionInstruction 必须使用中文。",
    "revisionInstruction 是给目标 builder 或人工编辑表单看的修改指令，不要直接生成新的 artifact 内容。",
    JSON.stringify({
      targetArtifact: "brief | storyboard | shotprompt",
      reason: "中文路由原因",
      revisionInstruction: "中文修改指令",
      confidence: "high | medium | low",
    }),
  ].join("\n");
}
