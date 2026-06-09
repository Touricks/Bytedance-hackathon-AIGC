import {
  STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC,
  STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
  audienceSchema,
  dealTypeSchema,
  productCategorySchema,
  strategySchema,
  type MaterialIntakeArtifact
} from "@aigc-video/shared";
import type { ArkJsonSchemaResponseFormat } from "../providers/ark-text.provider.js";

type JsonSchema = Record<string, unknown>;

const nonEmptyString = { type: "string", minLength: 1 };
const plainString = { type: "string" };
const integer = { type: "integer" };
const positiveInteger = { type: "integer", minimum: 1 };
const booleanSchema = { type: "boolean" };

function strictObject(
  properties: Record<string, JsonSchema>,
  required: string[]
): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties
  };
}

function arrayOf(items: JsonSchema, extra: JsonSchema = {}): JsonSchema {
  return {
    type: "array",
    items,
    ...extra
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
    schema: input.schema
  };
}

export function buildMaterialIntakeResponseFormat(
  schemaVersion: string
): ArkJsonSchemaResponseFormat {
  return responseFormat({
    name: "material_intake",
    description: "为素材清点步骤中的工作区素材打标。",
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
                  "other"
                ]
              },
              description: nonEmptyString,
              relevance: { type: "string", enum: ["high", "medium", "low"] },
              included: booleanSchema
            },
            ["ref", "role", "description", "relevance", "included"]
          )
        )
      },
      ["primaryProductRef", "tags"]
    )
  });
}

const productAssetSchema = strictObject(
  {
    ref: nonEmptyString,
    useAs: { type: "string", enum: ["primary", "support"] }
  },
  ["ref", "useAs"]
);

export function buildProductBriefResponseFormat(
  schemaVersion: string
): ArkJsonSchemaResponseFormat {
  return responseFormat({
    name: "product_brief",
    description: "生成可编辑的商品 brief artifact。",
    schemaVersion,
    schema: strictObject(
      {
        product: strictObject(
          {
            name: nonEmptyString,
            category: nonEmptyString,
            keyFacts: arrayOf(nonEmptyString),
            assets: arrayOf(productAssetSchema)
          },
          ["name", "category", "keyFacts", "assets"]
        ),
        audience: strictObject(
          {
            who: nonEmptyString,
            painOrDesire: nonEmptyString
          },
          ["who", "painOrDesire"]
        ),
        coreSellingPoint: nonEmptyString,
        proof: arrayOf(nonEmptyString),
        offer: nullableString(),
        platform: nonEmptyString,
        brandTone: nonEmptyString,
        bannedExpressions: arrayOf(plainString),
        landingInfo: nullableString(),
        assumptions: arrayOf(plainString)
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
        "assumptions"
      ]
    )
  });
}

const confidenceSchema = { type: "string", enum: ["low", "medium", "high"] };

export function buildReferenceVideoRequirementsResponseFormat(
  schemaVersion: string
): ArkJsonSchemaResponseFormat {
  return responseFormat({
    name: "reference_video_requirements",
    description: "从参考视频分析结构并推荐全局创作因子。",
    schemaVersion,
    schema: strictObject(
      {
        analysis: strictObject(
          {
            summary: nonEmptyString,
            confidence: confidenceSchema,
            detectedBeats: arrayOf(nonEmptyString),
            risks: arrayOf(nonEmptyString)
          },
          ["summary", "confidence", "detectedBeats", "risks"]
        ),
        creativeFactorsRecommendation: strictObject(
          {
            recommendedFactors: strictObject(
              {
                productCategory: {
                  type: "string",
                  enum: productCategorySchema.options
                },
                dealType: { type: "string", enum: dealTypeSchema.options },
                audience: {
                  type: "string",
                  enum: audienceSchema.options
                },
                strategy: {
                  type: "string",
                  enum: strategySchema.options
                }
              },
              ["productCategory", "dealType", "audience", "strategy"]
            ),
            confidence: confidenceSchema,
            reasons: arrayOf(nonEmptyString)
          },
          ["recommendedFactors", "confidence", "reasons"]
        )
      },
      ["analysis", "creativeFactorsRecommendation"]
    )
  });
}

export function buildSuggestCreativeFactorsResponseFormat(
  schemaVersion: string
): ArkJsonSchemaResponseFormat {
  return responseFormat({
    name: "suggest_creative_factors",
    description: "基于商品素材图片推荐全局创作因子。",
    schemaVersion,
    schema: strictObject(
      {
        summary: nonEmptyString,
        recommendedFactors: strictObject(
          {
            productCategory: { type: "string", enum: productCategorySchema.options },
            dealType: { type: "string", enum: dealTypeSchema.options },
            audience: { type: "string", enum: audienceSchema.options },
            strategy: { type: "string", enum: strategySchema.options }
          },
          ["productCategory", "dealType", "audience", "strategy"]
        ),
        confidence: confidenceSchema,
        reasons: arrayOf(nonEmptyString)
      },
      ["summary", "recommendedFactors", "confidence", "reasons"]
    )
  });
}

export function buildStoryboardResponseFormat(input: {
  schemaVersion: string;
  material: MaterialIntakeArtifact;
}): ArkJsonSchemaResponseFormat {
  const refs = materialRefs(input.material);
  return responseFormat({
    name: "ugc_storyboard",
    description: "生成可编辑的口播分镜 artifact。",
    schemaVersion: input.schemaVersion,
    schema: strictObject(
      {
        narrative: nonEmptyString,
        totalDurationSec: {
          type: "integer",
          enum: [STORYBOARD_SCRIPT_TOTAL_DURATION_SEC]
        },
        shots: arrayOf(
          strictObject(
            {
              index: integer,
              purpose: { type: "string", enum: ["hook", "proof", "cta"] },
              durationSec: {
                type: "integer",
                minimum: STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC
              },
              scene: nonEmptyString,
              visualDirection: nonEmptyString,
              productAssetRef: refSchema(refs),
              voiceover: nonEmptyString,
              transition: nonEmptyString
            },
            [
              "index",
              "purpose",
              "durationSec",
              "scene",
              "visualDirection",
              "productAssetRef",
              "voiceover",
              "transition"
            ]
          ),
          { minItems: 3, maxItems: 3 }
        ),
        assumptions: arrayOf(plainString)
      },
      ["narrative", "totalDurationSec", "shots", "assumptions"]
    )
  });
}

export function buildStoryboardVoiceoverRewriteResponseFormat(input: {
  schemaVersion: string;
  expectedShotCount: number;
}): ArkJsonSchemaResponseFormat {
  return responseFormat({
    name: "ugc_storyboard_voiceover_rewrite",
    description: "按已确认分镜结构重写每段中文口播，只返回 index 与 voiceover。",
    schemaVersion: input.schemaVersion,
    schema: strictObject(
      {
        shots: arrayOf(
          strictObject(
            {
              index: integer,
              voiceover: nonEmptyString
            },
            ["index", "voiceover"]
          ),
          {
            minItems: input.expectedShotCount,
            maxItems: input.expectedShotCount
          }
        )
      },
      ["shots"]
    )
  });
}

export function buildShotPromptResponseFormat(input: {
  schemaVersion: string;
  material: MaterialIntakeArtifact;
  expectedShotCount: number;
}): ArkJsonSchemaResponseFormat {
  const refs = materialRefs(input.material);
  const shotImageSchema = strictObject(
    {
      scene: nonEmptyString,
      composition: nonEmptyString,
      lighting: nonEmptyString,
      productVisibility: nonEmptyString,
      referenceUsage: nonEmptyString,
      negative: arrayOf(plainString)
    },
    [
      "scene",
      "composition",
      "lighting",
      "productVisibility",
      "referenceUsage",
      "negative"
    ]
  );
  const shotVideoSchema = strictObject(
    {
      cameraMotion: nonEmptyString,
      subjectMotion: nonEmptyString,
      firstFrameIntent: nonEmptyString,
      lastFrameIntent: nullableString(),
      durationIntent: nonEmptyString,
      continuity: nonEmptyString,
      negative: arrayOf(plainString)
    },
    [
      "cameraMotion",
      "subjectMotion",
      "firstFrameIntent",
      "lastFrameIntent",
      "durationIntent",
      "continuity",
      "negative"
    ]
  );
  return responseFormat({
    name: "video_shotprompt",
    description: "生成可编辑的Seedance 视频生成提示词 artifact。",
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
              shotImage: shotImageSchema,
              shotVideo: shotVideoSchema
            },
            [
              "index",
              "startSec",
              "endSec",
              "providerPrompt",
              "referenceAssetRefs",
              "voiceover",
              "shotImage",
              "shotVideo"
            ]
          ),
          { minItems: input.expectedShotCount, maxItems: input.expectedShotCount }
        ),
        tts: strictObject(
          {
            enabled: booleanSchema,
            source: { type: "string", enum: ["shots.voiceover"] },
            voiceover: plainString,
            voiceProfile: strictObject(
              {
                gender: { type: "string", enum: ["female", "male"] },
                tone: nonEmptyString,
                pitch: { type: "string", enum: ["low", "medium", "high"] },
                pace: { type: "string", enum: ["slow", "medium", "fast"] }
              },
              ["gender", "tone", "pitch", "pace"]
            )
          },
          ["enabled", "source", "voiceover", "voiceProfile"]
        ),
        assumptions: arrayOf(plainString)
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
    )
  });
}

export function buildRegenerateShotPromptResponseFormat(input: {
  schemaVersion: string;
  material: MaterialIntakeArtifact;
}): ArkJsonSchemaResponseFormat {
  const refs = materialRefs(input.material);
  return responseFormat({
    name: "video_shotprompt_single",
    description: "重新生成单个分镜的 Seedance 提示词。",
    schemaVersion: input.schemaVersion,
    schema: strictObject(
      {
        index: integer,
        startSec: integer,
        endSec: positiveInteger,
        providerPrompt: nonEmptyString,
        referenceAssetRefs: arrayOf(refSchema(refs)),
        voiceover: nonEmptyString,
        shotImage: strictObject(
          {
            scene: nonEmptyString,
            composition: nonEmptyString,
            lighting: nonEmptyString,
            productVisibility: nonEmptyString,
            referenceUsage: nonEmptyString,
            negative: arrayOf(plainString)
          },
          ["scene", "composition", "lighting", "productVisibility", "referenceUsage", "negative"]
        ),
        shotVideo: strictObject(
          {
            cameraMotion: nonEmptyString,
            subjectMotion: nonEmptyString,
            firstFrameIntent: nonEmptyString,
            lastFrameIntent: nullableString(),
            durationIntent: nonEmptyString,
            continuity: nonEmptyString,
            negative: arrayOf(plainString)
          },
          ["cameraMotion", "subjectMotion", "firstFrameIntent", "lastFrameIntent", "durationIntent", "continuity", "negative"]
        )
      },
      ["index", "startSec", "endSec", "providerPrompt", "referenceAssetRefs", "voiceover", "shotImage", "shotVideo"]
    )
  });
}

export function buildViralImitationResponseFormat(input: {
  schemaVersion: string;
  material: MaterialIntakeArtifact;
}): ArkJsonSchemaResponseFormat {
  const refs = materialRefs(input.material);
  return responseFormat({
    name: "ugc_viral_imitation",
    description: "模仿爆款结构生成可编辑的分镜 artifact。",
    schemaVersion: input.schemaVersion,
    schema: strictObject(
      {
        narrative: nonEmptyString,
        totalDurationSec: {
          type: "integer",
          enum: [STORYBOARD_SCRIPT_TOTAL_DURATION_SEC]
        },
        shots: arrayOf(
          strictObject(
            {
              index: integer,
              purpose: { type: "string", enum: ["hook", "proof", "cta"] },
              durationSec: {
                type: "integer",
                minimum: STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC
              },
              scene: nonEmptyString,
              visualDirection: nonEmptyString,
              productAssetRef: refSchema(refs),
              voiceover: nonEmptyString,
              transition: nonEmptyString
            },
            ["index", "purpose", "durationSec", "scene", "visualDirection", "productAssetRef", "voiceover", "transition"]
          ),
          { minItems: 3, maxItems: 3 }
        ),
        assumptions: arrayOf(plainString),
        viralTemplateUsed: nonEmptyString,
        matchReason: nonEmptyString
      },
      ["narrative", "totalDurationSec", "shots", "assumptions", "viralTemplateUsed", "matchReason"]
    )
  });
}

export function buildVideoBreakdownResponseFormat(schemaVersion: string): ArkJsonSchemaResponseFormat {
  return responseFormat({
    name: "video_breakdown",
    description: "分析参考视频的爆款结构，提取叙事和节奏模式。",
    schemaVersion,
    schema: strictObject(
      {
        hookTechnique: nonEmptyString,
        sellingPoints: arrayOf(nonEmptyString, { minItems: 1 }),
        structure: arrayOf(
          strictObject(
            {
              purpose: { type: "string", enum: ["hook", "benefit", "proof", "cta"] },
              description: nonEmptyString,
              durationSec: positiveInteger
            },
            ["purpose", "description", "durationSec"]
          ),
          { minItems: 3 }
        ),
        emotionalArc: nonEmptyString,
        copyStyle: nonEmptyString,
        suggestedCategories: arrayOf(nonEmptyString, { minItems: 1 }),
        suggestedName: nonEmptyString,
        whyViral: nonEmptyString
      },
      ["hookTechnique", "sellingPoints", "structure", "emotionalArc", "copyStyle", "suggestedCategories", "suggestedName", "whyViral"]
    )
  });
}
