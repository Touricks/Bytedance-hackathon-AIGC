import { Agent } from "@openai/agents";
import { StoryboardImagePromptOutputSchema } from "../schemas/image-prompt.schema.js";
import { loadSystemPrompt } from "./runner.js";

export const STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION = "v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildStoryboardImagePromptAgent(model: string): Agent<any, any> {
  return new Agent({
    name: "StoryboardImagePromptAgent",
    model,
    instructions: loadSystemPrompt("storyboard-image-prompt/v1.system.md"),
    outputType: StoryboardImagePromptOutputSchema,
  });
}
