import { isRealProviderMode, resolveTextProviderConfig } from "../providers/provider-config.js";
import { getModulePromptAssemblyMetadata, type ModulePromptAssemblyMetadata } from "../prompts/module-prompt-assembler.js";
import { StoryboardImagePromptOutputSchema, type StoryboardImagePromptOutput } from "../schemas/image-prompt.schema.js";
import { buildStoryboardImagePromptAgent, STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION } from "../agents/storyboard-image-prompt.agent.js";
import { buildRunner, runAgent, type RunnerContext } from "../agents/runner.js";

export interface ImagePromptAgentInput {
  workspaceId?: string;
  shotId?: string;
  userDirection?: string;
  number?: number;
  image_ref?: string;
  materialIntake?: unknown;
  previousImagePromptText?: string;
  productBrief: unknown;
  shot: {
    index: number;
    objective: string;
    sceneDescription?: string;
    defaultDurationSec?: number;
    productAssetRef?: string;
    referenceAssetRefs?: string[];
    providerPromptFromShotPrompt?: string;
    shotImage?: unknown;
  };
  referenceAssets: Array<{ id: string; role: string; summary: string }>;
  userHint?: string;
  stylePresetId?: string;
}

export interface ImagePromptAgentResult {
  templateVersion: string;
  promptAssembly: ModulePromptAssemblyMetadata;
  output: StoryboardImagePromptOutput;
}

export async function runStoryboardImagePromptAgent(input: {
  payload: ImagePromptAgentInput;
  context: RunnerContext;
}): Promise<ImagePromptAgentResult> {
  if (!isRealProviderMode()) {
    const referenceImageUsage = [
      ...input.payload.referenceAssets.map((a) => ({
        assetId: a.id,
        usage: "product_identity" as const,
        instruction: "Use as primary product reference",
      })),
      ...(input.payload.image_ref && input.payload.shot.index > 0
        ? [
            {
              assetId: input.payload.image_ref,
              usage: "scene_reference" as const,
              instruction: "Preserve scene, lighting, and composition continuity from image_ref",
            },
          ]
        : []),
    ];
    return {
      templateVersion: STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION,
      promptAssembly: getModulePromptAssemblyMetadata("image-prompt"),
      output: StoryboardImagePromptOutputSchema.parse({
        promptText: `MOCK image prompt for shot ${input.payload.shot.index}: ${input.payload.shot.objective}`,
        negativePrompt: "商品变形、文字模糊、场景突变",
        productVisibilityRule: "hero product clearly visible",
        referenceImageUsage,
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
    promptAssembly: getModulePromptAssemblyMetadata("image-prompt"),
    output: StoryboardImagePromptOutputSchema.parse(output),
  };
}
