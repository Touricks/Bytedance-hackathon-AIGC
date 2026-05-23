import { generateCreativeBlueprintWithArk } from "@aigc-video/ai";
import type {
  CreateCreativeBlueprintRequest,
  CreativeBlueprint
} from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { creativeBlueprintRepository } from "./creative-blueprint.repository.js";

async function generateBlueprint(input: CreateCreativeBlueprintRequest): Promise<{
  creativeBlueprint: CreativeBlueprint;
  trace: unknown;
  provider: "ark" | "fallback";
}> {
  const result = await generateCreativeBlueprintWithArk(input);
  return {
    creativeBlueprint: result.creativeBlueprint,
    trace: result.trace,
    provider: result.provider
  };
}

function createReadyShots(creativeBlueprint: CreativeBlueprint) {
  return creativeBlueprint.shots.map((shot) => ({
    index: shot.index,
    durationSec: shot.durationSec,
    purpose: shot.purpose,
    visualPrompt: shot.visualPrompt,
    cameraMotion: shot.cameraMotion,
    voiceover: shot.voiceover,
    subtitle: shot.subtitle,
    status: "ready" as const
  }));
}

export const creativeBlueprintService = {
  async createCreativeBlueprint(input: CreateCreativeBlueprintRequest) {
    if (input.draftScriptId) {
      const draft = await db.getScript(input.draftScriptId);
      if (!draft.frozen) {
        const imageAsset = await db.createAsset({
          type: "product_image",
          url: input.imageUrl,
          source: input.imageUrl.startsWith("/mocks/") ? "mock" : "upload"
        });
        const product = await db.updateProduct(draft.productId, {
          title: input.title,
          sellingPoints: input.sellingPoints,
          audience: input.audience,
          mainImageAssetId: imageAsset.id
        });
        const { creativeBlueprint, trace, provider } = await generateBlueprint(input);
        const script = await db.updateScript(draft.id, {
          narrative: creativeBlueprint.narrative,
          visualStyle: creativeBlueprint.visualStyle,
          rawJson: { creativeBlueprint, trace }
        });
        const shots = await db.replaceShots(
          script.id,
          createReadyShots(creativeBlueprint)
        );

        return {
          scriptId: script.id,
          product,
          imageAsset,
          script,
          creativeBlueprint,
          trace,
          provider,
          shots
        };
      }
    }

    const { product, imageAsset } = await creativeBlueprintRepository.createDraft(input);
    const { creativeBlueprint, trace, provider } = await generateBlueprint(input);
    const parentScript = input.draftScriptId
      ? await db.getScript(input.draftScriptId)
      : null;

    const script = await db.createScript({
      productId: product.id,
      parentScriptId: parentScript?.id,
      version: parentScript ? parentScript.version + 1 : 1,
      narrative: creativeBlueprint.narrative,
      visualStyle: creativeBlueprint.visualStyle,
      frozen: false,
      rawJson: { creativeBlueprint, trace }
    });

    const shots = await db.createShots(
      script.id,
      createReadyShots(creativeBlueprint)
    );

    return {
      scriptId: script.id,
      product,
      imageAsset,
      script,
      creativeBlueprint,
      trace,
      provider,
      shots
    };
  },

  getCreativeBlueprint(scriptId: string) {
    return creativeBlueprintRepository.getBlueprint(scriptId);
  },

  freezeCreativeBlueprint(scriptId: string) {
    return db.freezeScript(scriptId);
  },

  async createGenerationAttempt(scriptId: string) {
    const script = await db.getScript(scriptId);
    return db.createJob({
      productId: script.productId,
      scriptId,
      payload: { scriptId }
    });
  }
};
