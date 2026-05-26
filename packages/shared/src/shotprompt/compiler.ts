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
    const providerPrompt = `${startSec}-${endSec}s ${shot.purpose}: ${shot.scene}. ${shot.visualDirection} Reference ${shot.productAssetRef}.`;

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
      `${storyboard.totalDurationSec} second ${aspectRatio} ecommerce UGC video.`,
      storyboard.narrative,
      ...shots.map((shot) => shot.providerPrompt),
    ].join("\n"),
    negativePrompt:
      options.negativePrompt ??
      "low quality, distorted product, unreadable text",
    shots,
    tts: {
      enabled: true,
      source: "shots.voiceover",
      voiceover: storyboard.shots
        .map((shot) => shot.voiceover.trim())
        .join(" "),
    },
    assumptions: ["Compiled deterministically from approved storyboard."],
  });
}
