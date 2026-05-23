import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";
import { generateScriptWithSeed } from "../providers/seed-text.provider.js";
import { generateVideoWithSeedance } from "../providers/seedance-video.provider.js";
import { buildTwelveSecondVideoPrompt } from "../prompts/video.prompt.js";

export async function runOneClickVideoWorkflow(input: CreateCreativeBlueprintRequest) {
  const script = await generateScriptWithSeed(input);
  const prompt = buildTwelveSecondVideoPrompt(script);
  const video = await generateVideoWithSeedance({
    imageUrl: input.imageUrl,
    prompt
  });

  return {
    script,
    prompt,
    video
  };
}
