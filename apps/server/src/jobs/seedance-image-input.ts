import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Asset } from "@aigc-video/shared";
import { config } from "../common/config.js";

const uploadUrlPrefix = "/uploads/";
const dataImagePattern = /^data:(image\/[a-z0-9.+-]+);base64,/i;

const supportedSeedanceImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/gif"
]);

export const maxSeedanceLocalImageBytes = 10 * 1024 * 1024;

interface ResolveSeedanceImageInputOptions {
  uploadDir?: string;
  maxSizeBytes?: number;
}

function isPassThroughImageReference(url: string) {
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("asset://")
  );
}

function assertSupportedImageContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (!supportedSeedanceImageTypes.has(normalized)) {
    throw new Error(
      `Unsupported Seedance product image content type: ${contentType}`
    );
  }
  return normalized;
}

function getStringMetadata(asset: Asset, key: string) {
  const value = asset.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function getNumberMetadata(asset: Asset, key: string) {
  const value = asset.metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function assertInsideDirectory(filePath: string, rootPath: string) {
  const relative = path.relative(rootPath, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid upload path for Seedance product image");
  }
}

function resolveUploadStoragePath(
  asset: Asset,
  uploadRoot: string
): string {
  const metadataStoragePath = getStringMetadata(asset, "storagePath");
  const storagePath = metadataStoragePath
    ? path.resolve(metadataStoragePath)
    : path.resolve(uploadRoot, asset.url.slice(uploadUrlPrefix.length));

  assertInsideDirectory(storagePath, uploadRoot);
  return storagePath;
}

export async function resolveSeedanceImageInput(
  asset: Asset,
  options: ResolveSeedanceImageInputOptions = {}
): Promise<string> {
  const url = asset.url;

  if (isPassThroughImageReference(url)) {
    return url;
  }

  const dataUrlMatch = dataImagePattern.exec(url);
  if (dataUrlMatch) {
    assertSupportedImageContentType(dataUrlMatch[1]!);
    return url;
  }

  if (!url.startsWith(uploadUrlPrefix)) {
    throw new Error(`Unsupported Seedance product image reference: ${url}`);
  }

  const contentType = getStringMetadata(asset, "contentType");
  if (!contentType) {
    throw new Error("Uploaded product image is missing content type metadata");
  }

  const normalizedContentType = assertSupportedImageContentType(contentType);
  const uploadRoot = path.resolve(options.uploadDir ?? config.uploadDir);
  const storagePath = resolveUploadStoragePath(asset, uploadRoot);
  const maxSizeBytes = options.maxSizeBytes ?? maxSeedanceLocalImageBytes;
  const metadataSizeBytes = getNumberMetadata(asset, "sizeBytes");

  if (metadataSizeBytes !== undefined && metadataSizeBytes > maxSizeBytes) {
    throw new Error(
      `Uploaded product image is too large for Seedance base64 handoff: ${metadataSizeBytes} bytes`
    );
  }

  let fileStats;
  try {
    fileStats = await stat(storagePath);
  } catch {
    throw new Error("Uploaded product image file is missing for Seedance handoff");
  }
  if (fileStats.size > maxSizeBytes) {
    throw new Error(
      `Uploaded product image is too large for Seedance base64 handoff: ${fileStats.size} bytes`
    );
  }

  const bytes = await readFile(storagePath);
  return `data:${normalizedContentType};base64,${bytes.toString("base64")}`;
}
