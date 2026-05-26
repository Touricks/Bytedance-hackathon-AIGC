import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import type { ArkJsonSchemaResponseFormat } from "../providers/ark-text.provider.js";

type JsonSchema = Record<string, unknown>;

const nonEmptyString = { type: "string", minLength: 1 };
const plainString = { type: "string" };
const integer = { type: "integer" };
const positiveInteger = { type: "integer", minimum: 1 };
const booleanSchema = { type: "boolean" };

function strictObject(
  properties: Record<string, JsonSchema>,
  required: string[],
): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function arrayOf(items: JsonSchema, extra: JsonSchema = {}): JsonSchema {
  return {
    type: "array",
    items,
    ...extra,
  };
}

function nullableString(): JsonSchema {
  return { type: ["string", "null"] };
}

function refSchema(refs: string[]): JsonSchema {
  return refs.length > 0 ? { type: "string", enum: refs } : nonEmptyString;
}

function materialRefs(material: MaterialIntakeArtifact) {
  return material.assets
    .filter((asset) => asset.usable && asset.included)
    .map((asset) => asset.ref);
}

function responseFormat(input: {
  name: string;
  description: string;
  schemaVersion: string;
  schema: JsonSchema;
}): ArkJsonSchemaResponseFormat {
  return {
    type: "json_schema",
    name: input.name,
    description: input.description,
    schemaVersion: input.schemaVersion,
    strict: true,
    schema: input.schema,
  };
}

export function buildMaterialIntakeResponseFormat(
  schemaVersion: string,
): ArkJsonSchemaResponseFormat {
  return responseFormat({
    name: "material_intake_v1",
    description: "为 V1 素材清点步骤中的工作区素材打标。",
    schemaVersion,
    schema: strictObject(
      {
        primaryProductRef: nonEmptyString,
        tags: arrayOf(
          strictObject(
            {
              ref: nonEmptyString,
              role: {
                type: "string",
                enum: [
                  "product_main",
                  "product_detail",
                  "packaging",
                  "logo",
                  "demo_video",
                  "spec_text",
                  "reference",
                  "other",
                ],
              },
              description: nonEmptyString,
              relevance: { type: "string", enum: ["high", "medium", "low"] },
              included: booleanSchema,
            },
            ["ref", "role", "description", "relevance", "included"],
          ),
        ),
      },
      ["primaryProductRef", "tags"],
    ),
  });
}

const productAssetSchema = strictObject(
  {
    ref: nonEmptyString,
    useAs: { type: "string", enum: ["primary", "support"] },
  },
  ["ref", "useAs"],
);

export function buildProductBriefResponseFormat(
  schemaVersion: string,
): ArkJsonSchemaResponseFormat {
  return responseFormat({
    name: "product_brief_v1",
    description: "生成可编辑的 V1 商品 brief artifact。",
    schemaVersion,
    schema: strictObject(
      {
        product: strictObject(
          {
            name: nonEmptyString,
            category: nonEmptyString,
            keyFacts: arrayOf(nonEmptyString),
            assets: arrayOf(productAssetSchema),
          },
          ["name", "category", "keyFacts", "assets"],
        ),
        audience: strictObject(
          {
            who: nonEmptyString,
            painOrDesire: nonEmptyString,
          },
          ["who", "painOrDesire"],
        ),
        coreSellingPoint: nonEmptyString,
        proof: arrayOf(nonEmptyString),
        offer: nullableString(),
        platform: nonEmptyString,
        brandTone: nonEmptyString,
        bannedExpressions: arrayOf(plainString),
        landingInfo: nullableString(),
        assumptions: arrayOf(plainString),
      },
      [
        "product",
        "audience",
        "coreSellingPoint",
        "proof",
        "offer",
        "platform",
        "brandTone",
        "bannedExpressions",
        "landingInfo",
        "assumptions",
      ],
    ),
  });
}

export function buildStoryboardResponseFormat(input: {
  schemaVersion: string;
  material: MaterialIntakeArtifact;
}): ArkJsonSchemaResponseFormat {
  const refs = materialRefs(input.material);
  return responseFormat({
    name: "ugc_storyboard_v1",
    description: "生成可编辑的 V1 口播分镜 artifact。",
    schemaVersion: input.schemaVersion,
    schema: strictObject(
      {
        narrative: nonEmptyString,
        totalDurationSec: positiveInteger,
        shots: arrayOf(
          strictObject(
            {
              index: integer,
              purpose: { type: "string", enum: ["hook", "benefit", "proof", "cta"] },
              durationSec: positiveInteger,
              scene: nonEmptyString,
              visualDirection: nonEmptyString,
              productAssetRef: refSchema(refs),
              voiceover: nonEmptyString,
              transition: nonEmptyString,
            },
            [
              "index",
              "purpose",
              "durationSec",
              "scene",
              "visualDirection",
              "productAssetRef",
              "voiceover",
              "transition",
            ],
          ),
          { minItems: 1 },
        ),
        assumptions: arrayOf(plainString),
      },
      ["narrative", "totalDurationSec", "shots", "assumptions"],
    ),
  });
}

export function buildShotPromptResponseFormat(input: {
  schemaVersion: string;
  material: MaterialIntakeArtifact;
}): ArkJsonSchemaResponseFormat {
  const refs = materialRefs(input.material);
  return responseFormat({
    name: "video_shotprompt_v1",
    description: "生成可编辑的 V1 Seedance 视频生成提示词 artifact。",
    schemaVersion: input.schemaVersion,
    schema: strictObject(
      {
        targetProvider: { type: "string", enum: ["seedance"] },
        durationSec: positiveInteger,
        aspectRatio: { type: "string", enum: ["9:16", "16:9", "1:1"] },
        prompt: nonEmptyString,
        negativePrompt: plainString,
        shots: arrayOf(
          strictObject(
            {
              index: integer,
              startSec: integer,
              endSec: positiveInteger,
              providerPrompt: nonEmptyString,
              referenceAssetRefs: arrayOf(refSchema(refs)),
              voiceover: nonEmptyString,
            },
            [
              "index",
              "startSec",
              "endSec",
              "providerPrompt",
              "referenceAssetRefs",
              "voiceover",
            ],
          ),
          { minItems: 1 },
        ),
        tts: strictObject(
          {
            enabled: booleanSchema,
            source: { type: "string", enum: ["shots.voiceover"] },
            voiceover: plainString,
          },
          ["enabled", "source", "voiceover"],
        ),
        assumptions: arrayOf(plainString),
      },
      [
        "targetProvider",
        "durationSec",
        "aspectRatio",
        "prompt",
        "negativePrompt",
        "shots",
        "tts",
        "assumptions",
      ],
    ),
  });
}

export function buildFeedbackRouteResponseFormat(
  schemaVersion: string,
): ArkJsonSchemaResponseFormat {
  return responseFormat({
    name: "feedback_route_v1",
    description: "把成片反馈结构化路由到 brief、storyboard 或 shotprompt。",
    schemaVersion,
    schema: strictObject(
      {
        targetArtifact: {
          type: "string",
          enum: ["brief", "storyboard", "shotprompt"],
        },
        reason: nonEmptyString,
        revisionInstruction: nonEmptyString,
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      ["targetArtifact", "reason", "revisionInstruction", "confidence"],
    ),
  });
}
