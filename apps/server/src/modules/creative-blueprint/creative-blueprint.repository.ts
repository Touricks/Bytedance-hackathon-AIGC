import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";
import { db } from "../../db/client.js";

export const creativeBlueprintRepository = {
  async createDraft(input: CreateCreativeBlueprintRequest) {
    const imageAsset = await db.createAsset({
      type: "product_image",
      url: input.imageUrl,
      source: input.imageUrl.startsWith("/mocks/") ? "mock" : "upload"
    });

    const product = await db.createProduct({
      title: input.title,
      sellingPoints: input.sellingPoints,
      audience: input.audience,
      mainImageAssetId: imageAsset.id
    });

    return { product, imageAsset };
  },

  async getBlueprint(scriptId: string) {
    const script = await db.getScript(scriptId);
    const shots = await db.listShots(scriptId);
    const product = await db.getProduct(script.productId);
    const imageAsset = product.mainImageAssetId
      ? await db.getAsset(product.mainImageAssetId)
      : null;
    const creativeBlueprint =
      script.rawJson &&
      typeof script.rawJson === "object" &&
      "creativeBlueprint" in script.rawJson
        ? (script.rawJson as { creativeBlueprint: unknown }).creativeBlueprint
        : script.rawJson;

    return {
      scriptId: script.id,
      product,
      imageAsset,
      script,
      creativeBlueprint,
      shots
    };
  }
};
