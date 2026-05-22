import type { GeneratedScript } from "@aigc-video/shared";
import { buildTwelveSecondVideoPrompt } from "../prompts/video.prompt.js";

export function rebuildPromptAfterShotEdit(script: GeneratedScript): string {
  return buildTwelveSecondVideoPrompt(script);
}
