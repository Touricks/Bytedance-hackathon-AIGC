import type { CreateGenerationJobRequest } from "@aigc-video/shared";
import { generateScriptWithSeed } from "../providers/seed-text.provider.js";

export async function regenerateScriptWorkflow(input: CreateGenerationJobRequest) {
  return generateScriptWithSeed(input);
}
