import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const SHOTPROMPT_PROMPT_VERSION = "video-shotprompt.v1";

export interface BuildShotPromptPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  storyboard: StoryboardArtifact;
  aspectRatio: "9:16" | "16:9" | "1:1";
}

export interface BuildShotPromptPromptViewInput extends BuildShotPromptPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function voiceoverPreview(input: StoryboardArtifact) {
  return input.shots
    .map((shot) => `${shot.index + 1}. ${shot.voiceover}`)
    .join("\n");
}

export function buildShotPromptPromptView(
  input: BuildShotPromptPromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "视频生成提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body: "你是 Seedance 视频生成提示词构建器。请把已确认分镜转成商家可编辑、可传给 provider 的视频生成提示词。",
        },
        {
          id: "approved_storyboard",
          label: "已确认分镜",
          body: input.storyboard.narrative,
        },
        {
          id: "voiceover_source",
          label: "口播来源",
          body:
            voiceoverPreview(input.storyboard) ||
            "分镜中没有可用口播。",
        },
        {
          id: "task",
          label: "任务",
          body: "生成面向 Seedance 的提示词，必须保留商品、时间、参考素材和口播。V1 不生成字幕。",
        },
        {
          id: "output_contract",
          label: "输出契约",
          body: "返回严格 JSON，包含 targetProvider、durationSec、aspectRatio、prompt、negativePrompt、shots、tts 和 assumptions。shots 只包含 providerPrompt、参考素材和口播。",
        },
      ],
    },
    variables: {
      aspectRatio: input.aspectRatio,
      storyboardShotCount: input.storyboard.shots.length,
      voiceoverSource: "shots.voiceover",
      materialRefs: input.material.assets
        .filter((asset) => asset.included)
        .map((asset) => asset.ref),
    },
  };
}

export function buildShotPromptPrompt(input: BuildShotPromptPromptInput) {
  return [
    "角色：",
    "你是 Seedance 图生视频提示词构建器。你要把已确认分镜转成一份商家可编辑、可传给 provider 的 shotprompt artifact。",
    "",
    "输入：",
    `画幅比例：${input.aspectRatio}`,
    "已确认商品 brief：",
    JSON.stringify(input.brief),
    "已确认素材清单：",
    JSON.stringify(input.material.assets),
    "已确认分镜：",
    JSON.stringify(input.storyboard),
    "",
    "任务：",
    "生成面向 Seedance 的 shotprompt artifact，必须准确保持被引用商品。",
    "referenceAssetRefs 只能来自已确认素材清单。",
    "保持分镜时间和口播对齐。",
    "V1 不生成字幕，不要把可读文字作为视频生成要求。",
    "启用 tts，并从 shots[].voiceover 汇总完整 voiceover。tts 是渲染计划/结果，不是第二份可编辑脚本。",
    "不要改变上游商品主张或目标人群。",
    "",
    "输出：",
    "返回一个严格 JSON object，不要包含 Markdown。",
    "结构契约由 Ark response_format.json_schema 强制约束；不要依赖 prompt 里的示例推断字段。",
    "字段名、enum 和 schema key 必须严格使用机器契约中的英文值，例如 targetProvider、durationSec、aspectRatio、providerPrompt、shots.voiceover。",
    "字段值中的自然语言内容必须使用中文构建。",
    "prompt：全局视频目标和叙事主线，不要重复承载所有逐镜头 providerPrompt。",
    "negativePrompt：中文负向约束；如没有额外负向要求，可以返回空字符串。",
    "shots[].providerPrompt：逐镜头中文 Seedance 画面指令，必须来自已确认分镜和素材绑定。",
    "shots[].referenceAssetRefs：只能使用已确认素材清单里的 ref。",
    "tts.voiceover：从 shots[].voiceover 汇总，不新增第二份脚本。",
    "assumptions：只记录必要且可审计的中文假设。",
    "禁止输出占位符值，例如：字符串、string、TODO、N/A、示例、待补充。",
  ].join("\n");
}
