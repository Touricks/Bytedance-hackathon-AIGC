import { generateCreativeBlueprintWithArk } from "@aigc-video/ai";
import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { creativeBlueprintRepository } from "./creative-blueprint.repository.js";

export const creativeBlueprintService = {
  async createCreativeBlueprint(input: CreateCreativeBlueprintRequest) {
    const { product, imageAsset } = creativeBlueprintRepository.createDraft(input);
    const { creativeBlueprint, trace, provider } =
      await generateCreativeBlueprintWithArk(input);

    const script = db.createScript({
      productId: product.id,
      version: 1,
      narrative: creativeBlueprint.narrative,
      visualStyle: creativeBlueprint.visualStyle,
      rawJson: { creativeBlueprint, trace }
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
      trace,
      provider,
      shots
    };
  },

  getCreativeBlueprint(scriptId: string) {
    return creativeBlueprintRepository.getBlueprint(scriptId);
  }
};
