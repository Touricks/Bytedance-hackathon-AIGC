import type { LegacyGeneratedScript } from "@aigc-video/shared";
import { buildTwelveSecondVideoPrompt } from "../prompts/video.prompt.js";

/**
 * @deprecated V0 helper retained for legacy script editing paths only.
 */
export function rebuildPromptAfterShotEdit(script: LegacyGeneratedScript): string {
  return buildTwelveSecondVideoPrompt(script);
}
