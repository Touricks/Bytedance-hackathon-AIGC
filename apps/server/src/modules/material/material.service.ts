import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../../common/config.js";
import { materialRepository } from "./material.repository.js";

const extensionByContentType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg"
};

function safeExtension(filename: string, contentType: string) {
  const contentTypeExtension = extensionByContentType[contentType];
  if (contentTypeExtension) {
    return contentTypeExtension;
  }

  const parsed = path.extname(filename).toLowerCase();
  return parsed && parsed.length <= 10 ? parsed : ".img";
}

export const materialService = {
  registerProductImage(imageUrl: string) {
    return materialRepository.createProductImageAsset(imageUrl);
  },

  async uploadProductImage(input: {
    filename: string;
    contentType: string;
    dataBase64: string;
  }) {
    const bytes = Buffer.from(input.dataBase64, "base64");
    const uploadRoot = path.resolve(config.uploadDir, "product-images");
    await mkdir(uploadRoot, { recursive: true });

    const storedFilename = `${nanoid()}${safeExtension(
      input.filename,
      input.contentType
    )}`;
    const storagePath = path.join(uploadRoot, storedFilename);
    await writeFile(storagePath, bytes);

    return materialRepository.createUploadedProductImageAsset({
      url: `/uploads/product-images/${storedFilename}`,
      originalFilename: input.filename,
      contentType: input.contentType,
      sizeBytes: bytes.byteLength,
      storagePath
    });
  }
};
