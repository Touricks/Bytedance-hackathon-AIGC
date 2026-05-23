import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";
import { db } from "../../db/client.js";

async function findOrCreateProductImageAsset(imageUrl: string) {
  const existingAsset = await db.findProductImageAssetByUrl(imageUrl);
  if (existingAsset) {
    return existingAsset;
  }

  return db.createAsset({
    type: "product_image",
    url: imageUrl,
    source: imageUrl.startsWith("/mocks/") ? "mock" : "upload"
  });
}

export const creativeBlueprintRepository = {
  findOrCreateProductImageAsset,

  async createDraft(input: CreateCreativeBlueprintRequest) {
    const imageAsset = await findOrCreateProductImageAsset(input.imageUrl);

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
