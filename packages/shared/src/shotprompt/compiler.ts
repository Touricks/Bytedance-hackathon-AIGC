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

export function compileShotPrompt(
  input: StoryboardArtifact,
  options: CompileShotPromptOptions = {},
): ShotPromptArtifact {
  const storyboard = storyboardArtifactSchema.parse(input);
  const aspectRatio = options.aspectRatio ?? "9:16";
  let cursor = 0;
  const shots = storyboard.shots.map((shot) => {
    const startSec = cursor;
    const endSec = cursor + shot.durationSec;
    cursor = endSec;
    const providerPrompt = `${startSec}-${endSec} 秒 ${purposeLabel(shot.purpose)}：${sentence(shot.scene)}${sentence(shot.visualDirection)}参考素材：${shot.productAssetRef}。`;

    return {
      index: shot.index,
      startSec,
      endSec,
      providerPrompt,
      referenceAssetRefs: [shot.productAssetRef],
      voiceover: shot.voiceover,
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
