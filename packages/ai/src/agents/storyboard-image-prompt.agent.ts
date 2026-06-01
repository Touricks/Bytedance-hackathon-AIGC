import { Agent } from "@openai/agents";
import { buildModulePrompt } from "../prompts/module-prompt-assembler.js";
import { StoryboardImagePromptOutputSchema } from "../schemas/image-prompt.schema.js";

export const STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION = "v2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildStoryboardImagePromptAgent(model: string): Agent<any, any> {
  const instructions = buildModulePrompt({
    moduleId: "image-prompt",
    runtimeContext:
      "The user message is a JSON object matching the input contract. Use only that JSON and approved upstream artifacts embedded in it.",
  }).prompt;

  return new Agent({
    name: "StoryboardImagePromptAgent",
    model,
    instructions,
    outputType: StoryboardImagePromptOutputSchema,
  });
}
