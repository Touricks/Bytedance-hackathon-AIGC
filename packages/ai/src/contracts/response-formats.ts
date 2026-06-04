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
              shotImage: strictObject(
                {
                  scene: nonEmptyString,
                  composition: nonEmptyString,
                  productVisibility: nonEmptyString,
                  style: nonEmptyString,
                  negative: arrayOf(plainString),
                },
                ["scene", "composition", "productVisibility", "style", "negative"],
              ),
              shotVideo: strictObject(
                {
                  cameraMotion: nonEmptyString,
                  subjectMotion: nonEmptyString,
                  firstFrameIntent: nonEmptyString,
                  lastFrameIntent: nonEmptyString,
                  continuity: nonEmptyString,
                  negative: arrayOf(plainString),
                },
                ["cameraMotion", "subjectMotion", "firstFrameIntent", "lastFrameIntent", "continuity", "negative"],
              ),
            },
            [
              "index",
              "startSec",
              "endSec",
              "providerPrompt",
              "referenceAssetRefs",
              "voiceover",
              "shotImage",
              "shotVideo",
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

export function buildRegenerateShotResponseFormat(input: {
  schemaVersion: string;
  material: MaterialIntakeArtifact;
}): ArkJsonSchemaResponseFormat {
  const refs = materialRefs(input.material);
  return responseFormat({
    name: "regenerate_shot_v1",
    description: "重新生成单个分镜 shot，结构与 storyboard shot 一致。",
    schemaVersion: input.schemaVersion,
    schema: strictObject(
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
      ["index", "purpose", "durationSec", "scene", "visualDirection", "productAssetRef", "voiceover", "transition"],
    ),
  });
}

export function buildViralImitationResponseFormat(input: {
  schemaVersion: string;
  material: MaterialIntakeArtifact;
}): ArkJsonSchemaResponseFormat {
  const refs = materialRefs(input.material);
  const shotSchema = strictObject(
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
    ["index", "purpose", "durationSec", "scene", "visualDirection", "productAssetRef", "voiceover", "transition"],
  );
  return responseFormat({
    name: "viral_imitation_v1",
    description: "基于爆款模板库自动选模板并生成 UGC 分镜脚本。",
    schemaVersion: input.schemaVersion,
    schema: strictObject(
      {
        viralTemplateUsed: nonEmptyString,
        matchReason: nonEmptyString,
        narrative: nonEmptyString,
        totalDurationSec: positiveInteger,
        shots: arrayOf(shotSchema, { minItems: 6, maxItems: 6 }),
        assumptions: arrayOf(plainString),
      },
      ["viralTemplateUsed", "matchReason", "narrative", "totalDurationSec", "shots", "assumptions"],
    ),
  });
}

export function buildRegenerateShotPromptResponseFormat(input: {
  schemaVersion: string;
  material: MaterialIntakeArtifact;
}): ArkJsonSchemaResponseFormat {
  const refs = materialRefs(input.material);
  return responseFormat({
    name: "regenerate_shotprompt_v1",
    description: "重新生成单个 shotprompt shot（含 shotImage / shotVideo 完整结构）。",
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
            productVisibility: nonEmptyString,
            style: nonEmptyString,
            negative: arrayOf(plainString),
          },
          ["scene", "composition", "productVisibility", "style", "negative"],
        ),
        shotVideo: strictObject(
          {
            cameraMotion: nonEmptyString,
            subjectMotion: nonEmptyString,
            firstFrameIntent: nonEmptyString,
            lastFrameIntent: nonEmptyString,
            continuity: nonEmptyString,
            negative: arrayOf(plainString),
          },
          ["cameraMotion", "subjectMotion", "firstFrameIntent", "lastFrameIntent", "continuity", "negative"],
        ),
      },
      ["index", "startSec", "endSec", "providerPrompt", "referenceAssetRefs", "voiceover", "shotImage", "shotVideo"],
    ),
  });
}

export function buildVideoBreakdownResponseFormat(
  schemaVersion: string,
): ArkJsonSchemaResponseFormat {
  const shotSchema = strictObject(
    {
      purpose: { type: "string", enum: ["hook", "benefit", "proof", "cta"] },
      description: nonEmptyString,
      durationSec: positiveInteger,
    },
    ["purpose", "description", "durationSec"],
  );
  return responseFormat({
    name: "video_breakdown_v1",
    description: "对一段爆款视频进行结构化拆解，输出可复用的模板字段。",
    schemaVersion,
    schema: strictObject(
      {
        hookTechnique: nonEmptyString,
        sellingPoints: arrayOf(nonEmptyString, { minItems: 1 }),
        structure: arrayOf(shotSchema, { minItems: 3 }),
        emotionalArc: nonEmptyString,
        copyStyle: nonEmptyString,
        suggestedCategories: arrayOf(nonEmptyString, { minItems: 1 }),
        suggestedName: nonEmptyString,
        whyViral: nonEmptyString,
      },
      [
        "hookTechnique",
        "sellingPoints",
        "structure",
        "emotionalArc",
        "copyStyle",
        "suggestedCategories",
        "suggestedName",
        "whyViral",
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
