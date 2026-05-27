import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";

export const CREATIVE_BLUEPRINT_PROMPT_VERSION = "creative-blueprint.v1";

export function buildCreativeBlueprintPrompt(
  input: CreateCreativeBlueprintRequest
): string {
  return [
    "角色：",
    "你是电商短视频创意策划。你要生成商家可读的创作蓝图，不是最终视频渲染提示词。",
    "",
    "输入：",
    `商品标题：${input.title}`,
    `卖点：${input.sellingPoints}`,
    `目标人群：${input.audience}`,
    `风格偏好：${input.stylePreference}`,
    "上传图片背景：商品图片是最终图生视频生成的视觉事实源。",
    "",
    "任务：",
    "生成一份 12 秒电商视频创作蓝图，包含 2-4 个 storyboard shots。",
    "V0 为了保持视频稳定，只选择一个核心卖点。",
    "使用简单场景和平稳镜头运动。",
    "不要承诺精确字幕、精确 TTS、复杂转场或逐镜头渲染。",
    "包含 improvementHints，告诉商家如果视频效果不好，应修改哪个结构化 UI 字段。",
    "improvementHints.fieldsToChange 只能使用这些枚举值：productImage、title、coreSellingPoint、audience、stylePreference。",
    "当商家应修改选定卖点时使用 coreSellingPoint，不要使用 sellingPoints。",
    "",
    "输出：",
    "返回严格 JSON，匹配以下结构，不要包含 Markdown：",
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
          fieldsToChange: ["productImage", "coreSellingPoint"]
        }
      ]
    })
  ].join("\n");
}

export function buildCreativeBlueprintRepairPrompt(rawOutput: string): string {
  return [
    "请把以下模型输出修复为符合创作蓝图 schema 的严格 JSON。",
    "improvementHints.fieldsToChange 只能使用这些枚举值：productImage、title、coreSellingPoint、audience、stylePreference。",
    "如果输出把 sellingPoints 或 coreSellingPoint 当作自然语言字段目标，请统一规范为 coreSellingPoint。",
    "fieldsToChange 中不要使用 sellingPoints。",
    "不要包含 Markdown。尽量保留商家可读内容。",
    "",
    rawOutput
  ].join("\n");
}
