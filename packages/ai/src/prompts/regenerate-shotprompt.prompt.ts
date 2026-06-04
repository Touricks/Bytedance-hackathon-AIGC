import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  ShotPromptArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";

export const REGENERATE_SHOTPROMPT_PROMPT_VERSION = "regenerate-shotprompt.v1";

export interface RegenerateShotPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  currentShotPrompt: ShotPromptArtifact;
  updatedStoryboardShot: StoryboardArtifact["shots"][number];
  shotIndex: number;
}

const purposeEmotionGuide: Record<string, string> = {
  hook: "画面要有张力/悬念/冲突感，让人停下来想知道接下来发生什么",
  benefit: "画面要有生活真实感和代入感，像朋友随手拍的 UGC，不像广告",
  proof: "画面要有细节质感和可信度，特写、纹理、使用过程都能建立信任",
  cta: "画面要有美好向往感，让人觉得「拥有这个商品后生活会更好」",
};

function durationCompositionGuide(durationSec: number): string {
  if (durationSec === 1) return "只写一个单一动作/构图，不写镜头运动（时长来不及）";
  if (durationSec === 2) return "可包含一个短运动（推进或拉远）";
  return "可包含动作发展或镜头推进过程";
}

export function buildRegenerateShotPromptPrompt(
  input: RegenerateShotPromptInput,
): string {
  const { brief, material, currentShotPrompt, updatedStoryboardShot, shotIndex } = input;
  const refs = material.assets.filter((a) => a.included).map((a) => a.ref);
  const shot0 = currentShotPrompt.shots[0];
  const isBaseline = shotIndex === 0;

  return [
    "角色：",
    "你是 Seedance 图生视频提示词修订器。只更新指定镜头的 providerPrompt，必须保持整片场景一致性。",
    "",
    "当前 shotprompt 上下文（只读，用于保证场景连续性）：",
    `全局 prompt：${currentShotPrompt.prompt}`,
    `negativePrompt：${currentShotPrompt.negativePrompt}`,
    "各镜头当前 providerPrompt：",
    currentShotPrompt.shots
      .map((s) => `  shots[${s.index}]（${s.startSec}s-${s.endSec}s，purpose 由分镜决定）：${s.providerPrompt}`)
      .join("\n"),
    "",
    `需要更新的是 shots[${shotIndex}]（${updatedStoryboardShot.durationSec}s，purpose=${updatedStoryboardShot.purpose}）。`,
    "分镜层已更新为：",
    JSON.stringify({
      index: updatedStoryboardShot.index,
      purpose: updatedStoryboardShot.purpose,
      durationSec: updatedStoryboardShot.durationSec,
      scene: updatedStoryboardShot.scene,
      visualDirection: updatedStoryboardShot.visualDirection,
      productAssetRef: updatedStoryboardShot.productAssetRef,
      voiceover: updatedStoryboardShot.voiceover,
    }),
    "",
    isBaseline
      ? [
          "⚠️ 你正在修改 shots[0]（整片基准镜头）。",
          "新的 providerPrompt 必须完整建立整片基准场景：地点 + 光线方向 + 背景细节（台面材质/墙色/道具等）。",
          "后续 shots[1]~shots[5] 的场景延续规则将以此为参考基准。",
        ].join(" ")
      : [
          `场景延续约束：shots[0] 已建立如下基准场景：「${shot0?.providerPrompt ?? "未知"}」`,
          `你生成的 shots[${shotIndex}] providerPrompt 必须在五要素之后追加一句：`,
          `「【场景延续】保持与 shot 0 一致的 [地点]+[光线]+[背景]，不引入新场景或新背景元素。」`,
          "这是防止视频帧之间出现「陌生场景突变」的硬约束。",
        ].join(" "),
    "",
    "providerPrompt 格式要求：",
    "必须按「主体 + 动作/状态 + 镜头运动 + 光线风格 + 情绪氛围」五要素构建中文画面指令，缺一不可。",
    `情绪氛围必须匹配 purpose=${updatedStoryboardShot.purpose}：${purposeEmotionGuide[updatedStoryboardShot.purpose] ?? "根据上下文判断"}。`,
    `durationSec=${updatedStoryboardShot.durationSec}s，构图密度：${durationCompositionGuide(updatedStoryboardShot.durationSec)}。`,
    "✅ 合格示例（benefit）：「年轻女性坐在阳光充足的窗边随手拿起保温杯喝水，镜头跟随手部动作自然晃动，暖白自然光，轻松日常质感」",
    "❌ 禁止写法：仅有商品名（「保温杯展示」）、仅有情绪（「温馨的场景」）、抽象词（「高级感」「精致」「美好」）。",
    brief.bannedExpressions.length > 0
      ? `合规禁用词（providerPrompt 中绝对不得出现）：${brief.bannedExpressions.join("、")}。`
      : "",
    `referenceAssetRefs 只能使用以下 ref：${refs.join("、")}。`,
    "voiceover 直接使用分镜层已更新的 voiceover，原样复制，不修改。",
    "index、startSec、endSec 保持与当前 shotprompt 一致，不修改。",
    "禁止输出占位符值（字符串、TODO、N/A、待补充）。",
    "",
    "输出：",
    "只返回单个 shot JSON，结构契约由 Ark response_format.json_schema 强制约束。",
  ]
    .filter(Boolean)
    .join("\n");
}
