import {
  creativeBlueprintSchema,
  type CreateCreativeBlueprintRequest,
  type CreativeBlueprint
} from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { creativeBlueprintRepository } from "./creative-blueprint.repository.js";

function buildMockCreativeBlueprint(
  input: CreateCreativeBlueprintRequest
): CreativeBlueprint {
  const blueprint: CreativeBlueprint = {
    narrative: `${input.title} 的 12 秒带货短视频：先用干净商品 hero 镜头建立信任，再突出 ${input.sellingPoints}，最后回到购买暗示。`,
    visualStyle: input.stylePreference,
    targetAudience: input.audience,
    coreSellingPoint: input.sellingPoints,
    shots: [
      {
        index: 1,
        durationSec: 3,
        purpose: "hook",
        visualPrompt: `Clean hero shot of ${input.title}, centered and well lit`,
        cameraMotion: "slow push in",
        voiceover: `${input.title}，第一眼就能抓住注意力。`,
        subtitle: "第一眼就被吸引"
      },
      {
        index: 2,
        durationSec: 5,
        purpose: "benefit",
        visualPrompt: `Simple product detail or use-context shot showing ${input.sellingPoints}`,
        cameraMotion: "smooth stable pan",
        voiceover: `核心卖点是：${input.sellingPoints}`,
        subtitle: input.sellingPoints
      },
      {
        index: 3,
        durationSec: 4,
        purpose: "cta",
        visualPrompt: `Polished closing hero shot for ${input.audience}`,
        cameraMotion: "gentle pull back",
        voiceover: `适合${input.audience}，现在就试试。`,
        subtitle: "现在就试试"
      }
    ],
    renderBrief: {
      productConsistencyRules: [
        "Use the uploaded product image as the visual source of truth",
        "Keep product shape, color, material, logo, and packaging consistent"
      ],
      avoid: [
        "Do not invent new product parts",
        "Do not add extra brands or readable text"
      ],
      videoPromptSummary: `12-second ${input.stylePreference} ecommerce product showcase for ${input.title}`
    },
    improvementHints: [
      {
        ifVideoLooksBad: "商品不像原图",
        suggestedUserAction:
          "上传更清晰的正面商品图，或减少风格偏好中的复杂场景词。",
        fieldsToChange: ["productImage", "stylePreference"]
      }
    ]
  };

  return creativeBlueprintSchema.parse(blueprint);
}

export const creativeBlueprintService = {
  createCreativeBlueprint(input: CreateCreativeBlueprintRequest) {
    if (input.draftScriptId) {
      const draft = db.getScript(input.draftScriptId);
      if (!draft.frozen) {
        const imageAsset = db.createAsset({
          type: "product_image",
          url: input.imageUrl,
          source: input.imageUrl.startsWith("/mocks/") ? "mock" : "upload"
        });
        const product = db.updateProduct(draft.productId, {
          title: input.title,
          sellingPoints: input.sellingPoints,
          audience: input.audience,
          mainImageAssetId: imageAsset.id
        });
        const creativeBlueprint = buildMockCreativeBlueprint(input);
        const script = db.updateScript(draft.id, {
          narrative: creativeBlueprint.narrative,
          visualStyle: creativeBlueprint.visualStyle,
          rawJson: creativeBlueprint
        });
        const shots = db.replaceShots(
          script.id,
          creativeBlueprint.shots.map((shot) => ({
            index: shot.index,
            durationSec: shot.durationSec,
            purpose: shot.purpose,
            visualPrompt: shot.visualPrompt,
            cameraMotion: shot.cameraMotion,
            voiceover: shot.voiceover,
            subtitle: shot.subtitle,
            status: "ready"
          }))
        );

        return {
          scriptId: script.id,
          product,
          imageAsset,
          script,
          creativeBlueprint,
          shots
        };
      }
    }

    const { product, imageAsset } = creativeBlueprintRepository.createDraft(input);
    const creativeBlueprint = buildMockCreativeBlueprint(input);
    const parentScript = input.draftScriptId
      ? db.getScript(input.draftScriptId)
      : null;

    const script = db.createScript({
      productId: product.id,
      parentScriptId: parentScript?.id,
      version: parentScript ? parentScript.version + 1 : 1,
      narrative: creativeBlueprint.narrative,
      visualStyle: creativeBlueprint.visualStyle,
      frozen: false,
      rawJson: creativeBlueprint
    });

    const shots = db.createShots(
      script.id,
      creativeBlueprint.shots.map((shot) => ({
        index: shot.index,
        durationSec: shot.durationSec,
        purpose: shot.purpose,
        visualPrompt: shot.visualPrompt,
        cameraMotion: shot.cameraMotion,
        voiceover: shot.voiceover,
        subtitle: shot.subtitle,
        status: "ready"
      }))
    );

    return {
      scriptId: script.id,
      product,
      imageAsset,
      script,
      creativeBlueprint,
      shots
    };
  },

  getCreativeBlueprint(scriptId: string) {
    return creativeBlueprintRepository.getBlueprint(scriptId);
  },

  freezeCreativeBlueprint(scriptId: string) {
    return db.freezeScript(scriptId);
  },

  createGenerationAttempt(scriptId: string) {
    const script = db.getScript(scriptId);
    return db.createJob({
      productId: script.productId,
      scriptId,
      payload: { scriptId }
    });
  }
};
