import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";

export const CREATIVE_BLUEPRINT_PROMPT_VERSION = "creative-blueprint.v1";

export function buildCreativeBlueprintPrompt(
  input: CreateCreativeBlueprintRequest
): string {
  return [
    "Role:",
    "You are an ecommerce short-video creative planner. You create a merchant-readable creative blueprint, not a final video-rendering prompt.",
    "",
    "Inputs:",
    `Product title: ${input.title}`,
    `Selling points: ${input.sellingPoints}`,
    `Target audience: ${input.audience}`,
    `Style preference: ${input.stylePreference}`,
    "Uploaded image context: The product image is the visual source of truth for final image-to-video generation.",
    "",
    "Task:",
    "Create a 12-second ecommerce video creative blueprint with 2-4 storyboard shots.",
    "Pick exactly one core selling point for V0 to keep the video stable.",
    "Use simple scenes and stable camera motion.",
    "Do not promise exact subtitles, exact TTS, complex transitions, or per-shot rendering.",
    "Include improvement hints that tell the merchant which structured UI field to change if the video result is poor.",
    "",
    "Output:",
    "Return strict JSON matching this shape and do not include markdown:",
    JSON.stringify({
      narrative: "12 秒视频的叙事主线",
      visualStyle: "视觉风格",
      targetAudience: "目标人群复述",
      coreSellingPoint: "本次视频只主打的一个核心卖点",
      shots: [
        {
          index: 1,
          durationSec: 3,
          purpose: "hook | benefit | cta",
          visualPrompt: "用户可读画面描述",
          cameraMotion: "镜头运动",
          voiceover: "口播文案",
          subtitle: "字幕文案"
        }
      ],
      renderBrief: {
        productConsistencyRules: ["保持商品颜色/形状/包装一致"],
        avoid: ["不要生成不存在的品牌文字", "不要改变商品结构"],
        videoPromptSummary: "给系统内部渲染 prompt 使用的简短摘要"
      },
      improvementHints: [
        {
          ifVideoLooksBad: "商品不像原图",
          suggestedUserAction: "上传更清晰的正面商品图",
          fieldsToChange: ["productImage"]
        }
      ]
    })
  ].join("\n");
}

export function buildCreativeBlueprintRepairPrompt(rawOutput: string): string {
  return [
    "Repair the following model output into strict JSON matching the creative blueprint schema.",
    "Do not include markdown. Preserve merchant-readable content where possible.",
    "",
    rawOutput
  ].join("\n");
}
