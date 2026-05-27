import { db } from "../../db/client.js";

export const materialRepository = {
  createProductImageAsset(imageUrl: string) {
    return db.createAsset({
      type: "product_image",
      source: imageUrl.startsWith("/mocks/") ? "mock" : "upload",
      url: imageUrl
    });
  },

  createUploadedProductImageAsset(input: {
    url: string;
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
    storagePath: string;
  }) {
    return db.createAsset({
      type: "product_image",
      source: "upload",
      url: input.url,
      metadata: {
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        storagePath: input.storagePath
      }
    });
  }
};
