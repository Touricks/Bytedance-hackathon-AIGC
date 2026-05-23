import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";
import { generateScriptWithSeed } from "../providers/seed-text.provider.js";

export async function regenerateScriptWorkflow(input: CreateCreativeBlueprintRequest) {
  return generateScriptWithSeed(input);
}
