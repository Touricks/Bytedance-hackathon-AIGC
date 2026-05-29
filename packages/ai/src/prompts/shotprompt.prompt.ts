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
          id: "provider_prompt_format",
          label: "providerPrompt 格式",
          body: "每个 shots[].providerPrompt 必须按「主体 + 动作/状态 + 镜头运动 + 光线风格 + 情绪氛围」五要素构建中文画面指令。禁止使用抽象词（高级感、精致、美好），必须写可视化的具体动作和构图。",
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
    "prompt（全局主提示词）：描述整条视频的情绪转变弧线和商业目标，格式为：",
    "「[目标人群] 在 [场景/痛点] 下发现 [商品]，感受从 [负面情绪] 转变为 [正面情绪]，最终产生购买冲动。」",
    "不要重复堆砌所有逐镜头描述，保持在 2-3 句以内。",
    "negativePrompt：中文负向约束；如没有额外负向要求，可以返回空字符串。",
    "shots[].providerPrompt：逐镜头中文 Seedance 画面指令，必须来自已确认分镜和素材绑定。",
    "providerPrompt 必须按「主体 + 动作/状态 + 镜头运动 + 光线风格 + 情绪氛围」五要素构建，缺一不可。",
    "同时，每段 providerPrompt 的情绪氛围必须匹配对应 shot 的 purpose：",
    "- hook shot：画面要有张力/悬念/冲突感，让人停下来想知道接下来发生什么",
    "- benefit shot：画面要有生活真实感和代入感，像朋友随手拍的 UGC，不像广告",
    "- proof shot：画面要有细节质感和可信度，特写、纹理、使用过程都能建立信任",
    "- cta shot：画面要有美好向往感，让人觉得「拥有这个商品后生活会更好」",
    "✅ 合格示例（benefit shot）：「年轻女性坐在阳光充足的窗边随手拿起保温杯喝水，镜头跟随手部动作自然晃动，暖白自然光，轻松日常质感」",
    "❌ 禁止写法：仅有商品名（「保温杯展示」）、仅有情绪（「温馨的场景」）、抽象词（「高级感」「精致」「美好」）。",
    "negativePrompt 必须包含：文字水印、字幕叠加、变形扭曲、额外品牌标志、与素材不符的商品形态。",
    "shots[].referenceAssetRefs：只能使用已确认素材清单里的 ref。",
    "tts.voiceover：从 shots[].voiceover 汇总，不新增第二份脚本。",
    "assumptions：只记录必要且可审计的中文假设。",
    "禁止输出占位符值，例如：字符串、string、TODO、N/A、示例、待补充。",
  ].join("\n");
}
