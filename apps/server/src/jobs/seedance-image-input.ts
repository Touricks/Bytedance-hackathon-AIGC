import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Asset } from "@aigc-video/shared";
import { config } from "../common/config.js";

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
  uploadUrlPrefix?: string;
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

function isInsideDirectory(filePath: string, rootPath: string) {
  const relative = path.relative(rootPath, filePath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeLocalUploadUrlPrefix(prefix: string): string {
  const normalized = prefix.replace(/\/+$/, "");
  if (!normalized.startsWith("/")) {
    throw new Error(
      "Local upload URL prefix must be an absolute URL path for local file handoff"
    );
  }
  return normalized;
}

function workspaceMaterialRefFromUrl(url: string, uploadUrlPrefix?: string) {
  const workspaceApiMatch = /^\/api\/workspaces\/[^/]+\/materials\/(.+)$/.exec(
    url
  );
  if (workspaceApiMatch) {
    return decodeWorkspaceMaterialRef(workspaceApiMatch[1]!);
  }

  if (!uploadUrlPrefix) {
    return null;
  }

  const workspaceMaterialPrefix = `${normalizeLocalUploadUrlPrefix(
    uploadUrlPrefix
  )}/workspace-materials/`;
  if (!url.startsWith(workspaceMaterialPrefix)) {
    return null;
  }

  const rest = url.slice(workspaceMaterialPrefix.length);
  const separatorIndex = rest.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === rest.length - 1) {
    return null;
  }

  const encodedRef = rest.slice(separatorIndex + 1);
  return decodeWorkspaceMaterialRef(encodedRef);
}

function decodeWorkspaceMaterialRef(encodedRef: string) {
  let ref;
  try {
    ref = decodeURIComponent(encodedRef);
  } catch {
    return null;
  }

  if (
    path.basename(ref) !== ref ||
    ref.startsWith(".") ||
    ref === "." ||
    ref === ".."
  ) {
    return null;
  }

  return ref;
}

function assertWorkspaceMaterialStoragePath(
  storagePath: string,
  expectedRef: string
) {
  if (
    path.basename(storagePath) !== expectedRef ||
    path.basename(path.dirname(storagePath)) !== "materials" ||
    path.basename(path.dirname(path.dirname(storagePath))) !== ".daireel"
  ) {
    throw new Error("Invalid upload path for Seedance product image");
  }
}

function resolveUploadStoragePath(
  asset: Asset,
  uploadRoot: string | undefined,
  uploadUrlPrefix: string | undefined
): string {
  const metadataStoragePath = getStringMetadata(asset, "storagePath");
  const workspaceMaterialRef = metadataStoragePath
    ? workspaceMaterialRefFromUrl(asset.url, uploadUrlPrefix)
    : null;
  if (workspaceMaterialRef) {
    const storagePath = path.resolve(metadataStoragePath!);
    assertWorkspaceMaterialStoragePath(storagePath, workspaceMaterialRef);
    return storagePath;
  }

  if (!uploadRoot || !uploadUrlPrefix) {
    throw new Error(
      "Legacy uploaded product images require UPLOAD_DIR and UPLOAD_URL_PREFIX for Seedance handoff"
    );
  }

  const urlPrefix = `${normalizeLocalUploadUrlPrefix(uploadUrlPrefix)}/`;
  const storagePath = metadataStoragePath
    ? path.resolve(metadataStoragePath)
    : path.resolve(uploadRoot, asset.url.slice(urlPrefix.length));

  if (isInsideDirectory(storagePath, uploadRoot)) {
    return storagePath;
  }

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

  const uploadUrlPrefix = options.uploadUrlPrefix ?? config.uploadUrlPrefix;
  const normalizedUploadUrlPrefix = uploadUrlPrefix
    ? normalizeLocalUploadUrlPrefix(uploadUrlPrefix)
    : undefined;
  const workspaceMaterialRef = workspaceMaterialRefFromUrl(url, uploadUrlPrefix);
  if (
    !workspaceMaterialRef &&
    (!normalizedUploadUrlPrefix || !url.startsWith(`${normalizedUploadUrlPrefix}/`))
  ) {
    throw new Error(`Unsupported Seedance product image reference: ${url}`);
  }

  const contentType = getStringMetadata(asset, "contentType");
  if (!contentType) {
    throw new Error("Uploaded product image is missing content type metadata");
  }

  const normalizedContentType = assertSupportedImageContentType(contentType);
  const configuredUploadDir = options.uploadDir ?? config.uploadDir;
  const uploadRoot = configuredUploadDir
    ? path.resolve(configuredUploadDir)
    : undefined;
  const storagePath = resolveUploadStoragePath(
    asset,
    uploadRoot,
    normalizedUploadUrlPrefix
  );
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
