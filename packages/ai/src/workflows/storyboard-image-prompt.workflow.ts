import { isRealProviderMode, resolveTextProviderConfig } from "../providers/provider-config.js";
import { StoryboardImagePromptOutputSchema, type StoryboardImagePromptOutput } from "../schemas/image-prompt.schema.js";
import { buildStoryboardImagePromptAgent, STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION } from "../agents/storyboard-image-prompt.agent.js";
import { buildRunner, runAgent, type RunnerContext } from "../agents/runner.js";

export interface ImagePromptAgentInput {
  productBrief: unknown;
  shot: { index: number; objective: string; sceneDescription?: string; defaultDurationSec?: number };
  referenceAssets: Array<{ id: string; role: string; summary: string }>;
  userHint?: string;
  stylePresetId?: string;
}

export interface ImagePromptAgentResult {
  templateVersion: string;
  output: StoryboardImagePromptOutput;
}

export async function runStoryboardImagePromptAgent(input: {
  payload: ImagePromptAgentInput;
  context: RunnerContext;
}): Promise<ImagePromptAgentResult> {
  if (!isRealProviderMode()) {
    return {
      templateVersion: STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION,
      output: StoryboardImagePromptOutputSchema.parse({
        promptText: `MOCK image prompt for shot ${input.payload.shot.index}: ${input.payload.shot.objective}`,
        productVisibilityRule: "hero",
        referenceImageUsage: input.payload.referenceAssets.map((a) => ({
          assetId: a.id,
          usage: "product_identity",
          instruction: "Use as primary product reference",
        })),
        qualityChecklist: ["mock", "deterministic"],
      }),
    };
  }
  const cfg = resolveTextProviderConfig();
  if (!cfg) throw new Error("TEXT provider not configured (TEXT_API_KEY / TEXT_ENDPOINT_ID)");
  const runner = buildRunner(cfg);
  const agent = buildStoryboardImagePromptAgent(cfg.endpointId);
  const output = await runAgent<ImagePromptAgentInput, StoryboardImagePromptOutput>({
    agent,
    input: input.payload,
    context: input.context,
    runner,
  });
  return {
    templateVersion: STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION,
    output: StoryboardImagePromptOutputSchema.parse(output),
  };
}
