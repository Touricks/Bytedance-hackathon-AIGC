import type {
  CreativeBlueprint,
  LegacyGeneratedScript,
  ShotPromptArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

type LegacyVideoPromptInput = LegacyGeneratedScript | CreativeBlueprint;
type VideoPromptSource = LegacyVideoPromptInput | ShotPromptArtifact;

function getCoreSellingPoint(input: LegacyVideoPromptInput) {
  if ("coreSellingPoint" in input && input.coreSellingPoint) {
    return input.coreSellingPoint;
  }

  return input.shots[0]?.visualPrompt ?? input.narrative;
}

function getTargetAudience(input: LegacyVideoPromptInput) {
  return "targetAudience" in input && input.targetAudience
    ? input.targetAudience
    : "电商消费者";
}

function uniqueValues(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function formatReferenceAssets(refs: string[]) {
  const uniqueRefs = uniqueValues(refs);
  return uniqueRefs.length > 0 ? uniqueRefs.join("、") : "使用输入商品图片";
}

const defaultNegativePrompt =
  "不要出现字幕、水印、额外品牌、失真 Logo、与素材不一致的商品。";

function isShotPromptSource(
  source: VideoPromptSource,
): source is ShotPromptArtifact {
  return "targetProvider" in source && source.targetProvider === "seedance";
}

export interface BuildSeedanceVideoExportPromptInput {
  shotPrompt: ShotPromptArtifact;
}

export function buildSeedanceVideoExportPrompt(
  input: BuildSeedanceVideoExportPromptInput,
): string {
  const { shotPrompt } = input;
  const referenceAssets = formatReferenceAssets(
    shotPrompt.shots.flatMap((shot) => shot.referenceAssetRefs),
  );
  const shotLines = shotPrompt.shots
    .map((shot, index) =>
      [
        `${index + 1}. ${shot.startSec}-${shot.endSec} 秒：${shot.providerPrompt.trim()}`,
        `   引用素材：${formatReferenceAssets(shot.referenceAssetRefs)}`,
        `   口播：${shot.voiceover.trim() || "无"}`,
      ].join("\n"),
    )
    .join("\n");
  const negativePrompt =
    shotPrompt.negativePrompt.trim() || defaultNegativePrompt;
  const voiceover = shotPrompt.tts.enabled
    ? shotPrompt.tts.voiceover.trim()
    : "";

  return [
    "生成一条完整连续的 Seedance 图生视频，必须以已批准的视频剧本为事实源，不要拆成多个片段。",
    `视频规格：总时长 ${shotPrompt.durationSec} 秒，画幅 ${shotPrompt.aspectRatio}，目标 provider 为 Seedance。`,
    "",
    "主创意约束：",
    shotPrompt.prompt.trim(),
    "",
    "商品与素材约束：",
    "以传入 Seedance 的首帧商品图作为商品外观事实源。",
    `剧本素材绑定 ref：${referenceAssets}。这些 ref 用于说明每个镜头绑定的素材；如果当前 provider 只接收单张图，则以实际输入首帧图为准。`,
    "必须保持商品的形状、颜色、材质、Logo、包装和关键细节一致；不要生成新的商品部件、额外品牌或可读文字。",
    "",
    "逐镜头时间线：",
    shotLines,
    "",
    "口播参考：",
    voiceover || "无 TTS；按逐镜头口播理解节奏，不额外生成字幕文字。",
    "",
    "禁止项：",
    negativePrompt,
    "",
    "生成要求：生成一条连续完整视频，不要拆成多个拼接片段；镜头过渡自然，节奏稳定，商品始终清晰可信。",
  ].join("\n");
}

/**
 * @deprecated Legacy V0 whole-video prompt builder. V1 workspace video export
 * must call buildSeedanceVideoExportPrompt with the approved ShotPromptArtifact.
 */
export function buildTwelveSecondVideoPrompt(
  input: LegacyVideoPromptInput,
): string {
  const sellingPoint = getCoreSellingPoint(input);
  const audience = getTargetAudience(input);
  const approvedPrompt = input.narrative.trim();
  const shotInspiration = input.shots
    .map(
      (shot) =>
        `${shot.index}. ${shot.visualPrompt}；镜头运动：${shot.cameraMotion}`,
    )
    .join("\n");

  return [
    approvedPrompt,
    "",
    "请基于提供的商品图片生成一条 12 秒以内的竖屏电商商品展示视频；商品图片是外观事实源。",
    "",
    "必须保持商品的形状、颜色、材质、Logo、包装和关键细节一致。",
    "不要生成新的商品部件、额外品牌或可读文字。",
    "",
    "整体节奏：",
    "0-3 秒：干净的商品主视觉镜头，商品居中、光线稳定，缓慢推进。",
    `3-8 秒：用简单使用场景或细节特写呈现核心卖点：${sellingPoint}。`,
    "8-12 秒：回到精致商品主视觉画面，形成明确购买暗示。",
    "",
    `视觉风格：${input.visualStyle || "干净、高级、真实布光、高信任感的电商风格"}。`,
    `目标人群：${audience}。`,
    "镜头要求：平稳、顺滑，不要快速切换，不要拥挤背景。",
    "",
    "视频剧本分镜（作为最终视频的叙事顺序和画面约束；生成一条完整视频，不要拆成多个拼接片段）：",
    shotInspiration,
  ].join("\n");
}

export interface BuildVideoPromptViewInput {
  source: VideoPromptSource;
  prompt: string;
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  promptSource: "compiled_shotprompt" | "legacy_script";
  model?: string;
  jobId?: string;
  workspaceId?: string;
  scriptId?: string;
}

export function buildVideoPromptView(
  input: BuildVideoPromptViewInput,
): RuntimePromptView {
  const source = input.source;
  const isShotPrompt = isShotPromptSource(source);
  const timeline = isShotPrompt
    ? source.shots
        .map(
          (shot, index) =>
            `${index + 1}. ${shot.startSec}-${shot.endSec} 秒：${shot.providerPrompt}`,
        )
        .join("\n")
    : "0-3 秒商品主视觉镜头，3-8 秒使用场景或细节特写，8-12 秒精致商品主视觉收束。";

  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "Seedance 成片提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body: "基于已确认商品图片和视频剧本生成一条电商商品展示短视频。",
        },
        {
          id: "identity_lock",
          label: "商品一致性锁定",
          body: "保持商品形状、颜色、材质、Logo、包装和关键细节一致。不要编造新的商品部件或可读文字。",
        },
        {
          id: "timeline",
          label: "时间线",
          body: timeline,
        },
        {
          id: "provider_prompt",
          label: "Provider 提示词",
          body: input.prompt,
        },
      ],
    },
    variables: {
      jobId: input.jobId ?? null,
      workspaceId: input.workspaceId ?? null,
      scriptId: input.scriptId ?? null,
      promptSource: input.promptSource,
      visualStyle: isShotPrompt
        ? `${source.aspectRatio} Seedance 视频剧本`
        : source.visualStyle,
      shotCount: source.shots.length,
      targetProvider: isShotPrompt ? source.targetProvider : null,
      durationSec: isShotPrompt ? source.durationSec : null,
    },
  };
}
