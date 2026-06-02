import {
  shotPromptArtifactSchema,
  storyboardArtifactSchema,
  type ShotPromptArtifact,
  type StoryboardArtifact,
} from "../schemas/artifacts.js";

export interface CompileShotPromptOptions {
  aspectRatio?: "9:16" | "16:9" | "1:1";
  negativePrompt?: string;
}

function purposeLabel(purpose: StoryboardArtifact["shots"][number]["purpose"]) {
  const labels = {
    hook: "开场吸引",
    benefit: "卖点展示",
    proof: "可信证明",
    cta: "行动引导",
  };
  return labels[purpose];
}

function sentence(text: string) {
  return `${text.trim().replace(/[。.!?！？]+$/u, "")}。`;
}

function shotImageFallback(input: {
  shot: StoryboardArtifact["shots"][number];
  providerPrompt: string;
}) {
  return {
    scene: `静态关键帧场景：${sentence(input.shot.scene)}`,
    composition: sentence(input.shot.visualDirection),
    lighting: "保持真实电商短视频场景光线，主体清晰稳定。",
    productVisibility: `参考素材 ${input.shot.productAssetRef} 中的商品/主体必须清晰可见。`,
    referenceUsage: `使用 ${input.shot.productAssetRef} 保持商品身份和画面语境。`,
    negative: ["商品变形", "文字乱码", "画面模糊", "场景漂移"],
    providerPrompt: input.providerPrompt,
  };
}

function shotVideoFallback(input: {
  shot: StoryboardArtifact["shots"][number];
  providerPrompt: string;
  nextShot?: StoryboardArtifact["shots"][number];
}) {
  return {
    cameraMotion: sentence(input.shot.visualDirection),
    subjectMotion: "商品/主体保持真实稳定，只做与分镜目标一致的轻微自然运动。",
    firstFrameIntent: `从本镜头静态关键帧开始：${sentence(input.shot.scene)}`,
    lastFrameIntent: input.nextShot
      ? `自然过渡到下一镜头语境：${sentence(input.nextShot.scene)}`
      : null,
    durationIntent: `${input.shot.durationSec} 秒内完成本镜头目标。`,
    continuity: "保持商品身份、色彩、光线和空间关系连续。",
    negative: ["商品变形", "镜头抖动", "不自然运动", "字幕或可读文字"],
    providerPrompt: input.providerPrompt,
  };
}

export function compileShotPrompt(
  input: StoryboardArtifact,
  options: CompileShotPromptOptions = {},
): ShotPromptArtifact {
  const storyboard = storyboardArtifactSchema.parse(input);
  const aspectRatio = options.aspectRatio ?? "9:16";
  let cursor = 0;
  const shots = storyboard.shots.map((shot, index) => {
    const startSec = cursor;
    const endSec = cursor + shot.durationSec;
    cursor = endSec;
    const providerPrompt = `${startSec}-${endSec} 秒 ${purposeLabel(shot.purpose)}：${sentence(shot.scene)}${sentence(shot.visualDirection)}参考素材：${shot.productAssetRef}。`;
    const nextShot = storyboard.shots[index + 1];

    return {
      index: shot.index,
      startSec,
      endSec,
      providerPrompt,
      referenceAssetRefs: [shot.productAssetRef],
      voiceover: shot.voiceover,
      shotImage: shotImageFallback({ shot, providerPrompt }),
      shotVideo: shotVideoFallback({ shot, providerPrompt, nextShot }),
    };
  });

  return shotPromptArtifactSchema.parse({
    targetProvider: "seedance",
    durationSec: storyboard.totalDurationSec,
    aspectRatio,
    prompt: [
      `${storyboard.totalDurationSec} 秒 ${aspectRatio} 电商 UGC 视频。`,
      storyboard.narrative,
      "生成一条连续完整视频，按已确认分镜推进节奏，商品外观始终稳定可信。",
    ].join("\n"),
    negativePrompt:
      options.negativePrompt ??
      "低质量，商品变形，不可读文字",
    shots,
    tts: {
      enabled: true,
      source: "shots.voiceover",
      voiceover: storyboard.shots
        .map((shot) => shot.voiceover.trim())
        .join(" "),
    },
    assumptions: ["已从通过审核的分镜确定性编译。"],
  });
}
