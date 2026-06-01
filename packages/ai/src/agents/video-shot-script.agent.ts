import { Agent } from "@openai/agents";
import { buildModulePrompt } from "../prompts/module-prompt-assembler.js";
import { VideoShotScriptOutputSchema } from "../schemas/video-script.schema.js";

export const VIDEO_SHOT_SCRIPT_TEMPLATE_VERSION = "v2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildVideoShotScriptAgent(model: string): Agent<any, any> {
  const instructions = buildModulePrompt({
    moduleId: "video-script",
    runtimeContext:
      "The user message is a JSON object matching the input contract. Use only that JSON and approved upstream artifacts embedded in it.",
  }).prompt;

  return new Agent({
    name: "VideoShotScriptAgent",
    model,
    instructions,
    outputType: VideoShotScriptOutputSchema,
  });
}
