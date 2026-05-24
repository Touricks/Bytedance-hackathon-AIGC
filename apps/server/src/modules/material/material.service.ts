import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../../common/config.js";
import { assertValidRasterImageBytes } from "../../common/image-validation.js";
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

function buildUploadUrl(pathname: string) {
  return `${config.uploadUrlPrefix}/${pathname.replace(/^\/+/, "")}`;
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
    const contentType = assertValidRasterImageBytes(bytes, input.contentType);
    const uploadRoot = path.resolve(config.uploadDir, "product-images");
    await mkdir(uploadRoot, { recursive: true });

    const storedFilename = `${nanoid()}${safeExtension(
      input.filename,
      contentType
    )}`;
    const storagePath = path.join(uploadRoot, storedFilename);
    await writeFile(storagePath, bytes);

    return materialRepository.createUploadedProductImageAsset({
      url: buildUploadUrl(`product-images/${storedFilename}`),
      originalFilename: input.filename,
      contentType,
      sizeBytes: bytes.byteLength,
      storagePath
    });
  }
};
