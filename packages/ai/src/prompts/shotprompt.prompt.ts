import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";
import { formatCreativeRequirementsForModule } from "./creative-requirements-context.js";
import { buildModulePrompt } from "./module-prompt-assembler.js";

export const SHOTPROMPT_PROMPT_VERSION = "video-shotprompt.v1";

export interface BuildShotPromptPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  storyboard: StoryboardArtifact;
  aspectRatio: "9:16" | "16:9" | "1:1";
  creativeRequirements?: unknown;
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
  const creativeRequirements = formatCreativeRequirementsForModule(
    input.creativeRequirements,
    "shotprompt",
  );
  return buildModulePrompt({
    moduleId: "shotprompt",
    runtimeContext: [
      creativeRequirements,
      "输入：",
      `画幅比例：${input.aspectRatio}`,
      `必须输出 shot 数量：${input.storyboard.shots.length}`,
      `必须输出 shot index 顺序：${input.storyboard.shots.map((shot) => shot.index).join(", ")}`,
      "已确认商品 brief：",
      JSON.stringify(input.brief),
      "已确认素材清单：",
      JSON.stringify(input.material.assets),
      "已确认分镜：",
      JSON.stringify(input.storyboard),
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n"),
  }).prompt;
}
