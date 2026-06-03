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
  feedbackImageRef?: string;
  feedbackImageCandidateId?: string;
  materialIntake?: unknown;
  previousImagePromptText?: string;
  compiledShotRequirements?: string;
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
    shotVideo?: unknown;
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
        instruction: "作为主商品身份和外观参考",
      })),
      ...(input.payload.image_ref && input.payload.shot.index > 0
        ? [
            {
              assetId: input.payload.image_ref,
              usage: "scene_reference" as const,
              instruction: "保留 image_ref 的静态场景、光线、色调和构图连续性",
            },
          ]
        : []),
      ...(input.payload.feedbackImageRef
        ? [
            {
              assetId: input.payload.feedbackImageRef,
              usage: "composition_reference" as const,
              instruction: "以当前已生成分镜图作为反馈基准，保留可用的主体、构图和场景基础，并按本次反馈调整",
            },
          ]
        : []),
    ];
    return {
      templateVersion: STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION,
      promptAssembly: getModulePromptAssemblyMetadata("image-prompt"),
      output: StoryboardImagePromptOutputSchema.parse({
        promptText: `第 ${input.payload.shot.index} 镜静态关键帧：${input.payload.shot.objective}。已参考上游分镜生成要求${
          input.payload.userDirection ? `，并按反馈调整：${input.payload.userDirection}` : ""
        }。清晰呈现商品主体、环境、构图、光线和参考图一致性。`,
        negativePrompt: "商品变形、文字模糊、场景突变",
        visualStyle: null,
        composition: null,
        lighting: null,
        productVisibilityRule: "商品主体清晰可见，外形、材质和包装细节不得变形",
        referenceImageUsage,
        qualityChecklist: ["静态关键帧", "商品不变形"],
      }),
    };
  }
  const cfg = resolveTextProviderConfig();
  if (!cfg) throw new Error("TEXT provider not configured (TEXT_API_KEY / TEXT_ENDPOINT_ID)");
  const runner = buildRunner(cfg, { useResponses: true });
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
