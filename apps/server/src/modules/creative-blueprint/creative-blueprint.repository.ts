import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";
import { db } from "../../db/client.js";

export const creativeBlueprintRepository = {
  createDraft(input: CreateCreativeBlueprintRequest) {
    const imageAsset = db.createAsset({
      type: "product_image",
      url: input.imageUrl,
      source: input.imageUrl.startsWith("/mocks/") ? "mock" : "upload"
    });

    const product = db.createProduct({
      title: input.title,
      sellingPoints: input.sellingPoints,
      audience: input.audience,
      mainImageAssetId: imageAsset.id
    });

    return { product, imageAsset };
  },

  getBlueprint(scriptId: string) {
    const script = db.getScript(scriptId);
    const shots = db.listShots(scriptId);
    const product = db.getProduct(script.productId);
    const imageAsset = product.mainImageAssetId
      ? db.getAsset(product.mainImageAssetId)
      : null;

    return {
      scriptId: script.id,
      product,
      imageAsset,
      script,
      creativeBlueprint: script.rawJson,
      shots
    };
  }
};
