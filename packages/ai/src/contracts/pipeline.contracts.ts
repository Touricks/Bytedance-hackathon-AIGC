import { MATERIAL_INTAKE_PROMPT_VERSION } from "../prompts/material-intake.prompt.js";
import { PRODUCT_BRIEF_PROMPT_VERSION } from "../prompts/product-brief.prompt.js";
import { SHOTPROMPT_PROMPT_VERSION } from "../prompts/shotprompt.prompt.js";
import { STORYBOARD_PROMPT_VERSION } from "../prompts/storyboard.prompt.js";
import { STORYBOARD_SCRIPT_TOTAL_DURATION_SEC } from "@aigc-video/shared";

export interface PipelineContractStep {
  id:
    | "material_intake"
    | "product_brief"
    | "storyboard"
    | "shotprompt";
  activeVersion: string;
  promptBuilder: string;
  provider: "ark";
  inputJsonSchema: Record<string, unknown>;
  outputJsonSchema: Record<string, unknown>;
  targetSharedArtifact?: string;
}

export interface PipelineContractRegistry {
  contractSet: string;
  steps: PipelineContractStep[];
}

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    type: "object",
    additionalProperties: true,
    required,
    properties
  };
}

const stringSchema = { type: "string" };
const arraySchema = { type: "array", items: {} };
const materialArtifactSchema = objectSchema(
  {
    scannedAt: stringSchema,
    primaryProductRef: stringSchema,
    assets: arraySchema,
    rejected: arraySchema
  },
  ["scannedAt", "primaryProductRef", "assets", "rejected"]
);

const steps: PipelineContractStep[] = [
  {
    id: "material_intake",
    activeVersion: MATERIAL_INTAKE_PROMPT_VERSION,
    promptBuilder: "buildMaterialIntakePrompt",
    provider: "ark",
    inputJsonSchema: objectSchema(
      {
        initialPrompt: stringSchema,
        scanned: materialArtifactSchema,
        textPreviews: arraySchema
      },
      ["scanned"]
    ),
    outputJsonSchema: objectSchema(
      {
        primaryProductRef: stringSchema,
        tags: arraySchema
      },
      ["tags"]
    ),
    targetSharedArtifact: "MaterialIntakeArtifact"
  },
  {
    id: "product_brief",
    activeVersion: PRODUCT_BRIEF_PROMPT_VERSION,
    promptBuilder: "buildProductBriefPrompt",
    provider: "ark",
    inputJsonSchema: objectSchema(
      {
        title: stringSchema,
        sellingPoints: stringSchema,
        audience: stringSchema,
        stylePreference: stringSchema,
        material: materialArtifactSchema
      },
      ["title", "sellingPoints", "audience", "material"]
    ),
    outputJsonSchema: objectSchema(
      {
        product: objectSchema({}, []),
        audience: objectSchema({}, []),
        coreSellingPoint: stringSchema,
        proof: arraySchema,
        assumptions: arraySchema
      },
      ["product", "audience", "coreSellingPoint", "proof", "assumptions"]
    ),
    targetSharedArtifact: "ProductBriefArtifact"
  },
  {
    id: "storyboard",
    activeVersion: STORYBOARD_PROMPT_VERSION,
    promptBuilder: "buildStoryboardPrompt",
    provider: "ark",
    inputJsonSchema: objectSchema(
      {
        brief: objectSchema({}, []),
        material: materialArtifactSchema
      },
      ["brief", "material"]
    ),
    outputJsonSchema: objectSchema(
      {
        narrative: stringSchema,
        totalDurationSec: {
          type: "integer",
          enum: [STORYBOARD_SCRIPT_TOTAL_DURATION_SEC]
        },
        shots: { ...arraySchema, minItems: 3, maxItems: 3 },
        assumptions: arraySchema
      },
      ["narrative", "totalDurationSec", "shots", "assumptions"]
    ),
    targetSharedArtifact: "StoryboardArtifact"
  },
  {
    id: "shotprompt",
    activeVersion: SHOTPROMPT_PROMPT_VERSION,
    promptBuilder: "buildShotPromptPrompt",
    provider: "ark",
    inputJsonSchema: objectSchema(
      {
        brief: objectSchema({}, []),
        material: materialArtifactSchema,
        storyboard: objectSchema({}, []),
        aspectRatio: stringSchema
      },
      ["brief", "material", "storyboard", "aspectRatio"]
    ),
    outputJsonSchema: objectSchema(
      {
        targetProvider: stringSchema,
        durationSec: { type: "number" },
        aspectRatio: stringSchema,
        prompt: stringSchema,
        negativePrompt: stringSchema,
        shots: arraySchema,
        tts: objectSchema({}, []),
        assumptions: arraySchema
      },
      [
        "targetProvider",
        "durationSec",
        "aspectRatio",
        "prompt",
        "negativePrompt",
        "shots",
        "tts",
        "assumptions"
      ]
    ),
    targetSharedArtifact: "ShotPromptArtifact"
  }
];

function activeVersionOverrides() {
  const raw = process.env.AIGC_VIDEO_PIPELINE_CONTRACT_OVERRIDES;
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as Partial<
    Record<PipelineContractStep["id"], string>
  >;
  return parsed;
}

function withActiveVersionOverride(step: PipelineContractStep): PipelineContractStep {
  const override = activeVersionOverrides()[step.id];
  return override ? { ...step, activeVersion: override } : step;
}

export function getPipelineContracts(): PipelineContractRegistry {
  return {
    contractSet: process.env.AIGC_VIDEO_PIPELINE_CONTRACT_SET ?? "current",
    steps: steps.map(withActiveVersionOverride)
  };
}

export function getPipelineContractStep(id: PipelineContractStep["id"]) {
  const step = steps.find((candidate) => candidate.id === id);
  if (!step) {
    throw new Error(`Unknown pipeline contract step: ${id}`);
  }
  return withActiveVersionOverride(step);
}
