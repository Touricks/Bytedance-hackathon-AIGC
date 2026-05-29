import { Agent } from "@openai/agents";
import { VideoShotScriptOutputSchema } from "../schemas/video-script.schema.js";
import { loadSystemPrompt } from "./runner.js";

export const VIDEO_SHOT_SCRIPT_TEMPLATE_VERSION = "v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildVideoShotScriptAgent(model: string): Agent<any, any> {
  return new Agent({
    name: "VideoShotScriptAgent",
    model,
    instructions: loadSystemPrompt("video-shot-script/v1.system.md"),
    outputType: VideoShotScriptOutputSchema,
  });
}
