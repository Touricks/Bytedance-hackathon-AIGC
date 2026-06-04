import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolveWorkspaceStorageLocalPath } from "../workspace/workspace.service.js";

type GeneratedAssetKind = "image" | "video";

export interface PersistGeneratedAssetResult {
  stableUrl: string;
  objectKey: string | null;
  providerTemporaryUrl: string | null;
  bytes?: number | null;
}

export type GeneratedAssetPersister = (input: {
  workspaceId: string;
  sourceUrl: string;
  kind: GeneratedAssetKind;
  batchId: string;
  candidateId: string;
  fetchImpl?: typeof fetch;
  downloadTimeoutMs?: number;
}) => Promise<PersistGeneratedAssetResult>;

function defaultDownloadTimeoutMs() {
  const raw = Number(process.env.GENERATED_ASSET_DOWNLOAD_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 300_000;
}

function extensionFromContentType(contentType: string | null, kind: GeneratedAssetKind) {
  if (contentType?.includes("jpeg")) return ".jpg";
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("mp4")) return ".mp4";
  if (contentType?.includes("quicktime")) return ".mov";
  return kind === "image" ? ".png" : ".mp4";
}

function extensionFromUrl(sourceUrl: string, kind: GeneratedAssetKind) {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ext) return ext;
  } catch {
    // Non-absolute URLs are handled by the caller as already-stable paths.
  }
  return kind === "image" ? ".png" : ".mp4";
}

function parseDataUrl(sourceUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(sourceUrl);
  if (!match) return null;
  const [, contentType, encoded] = match;
  if (!contentType || !encoded) return null;
  return {
    contentType,
    bytes: Buffer.from(encoded, "base64"),
  };
}

function isWorkspaceStableUrl(workspaceId: string, sourceUrl: string) {
  return sourceUrl.startsWith(`/api/workspaces/${workspaceId}/`);
}

export async function downloadHttpGeneratedAsset(input: {
  sourceUrl: string;
  targetPath: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const timeoutMs = input.timeoutMs ?? defaultDownloadTimeoutMs();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const response = await (input.fetchImpl ?? fetch)(input.sourceUrl, {
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to persist provider asset URL ${response.status}`,
      );
    }
    const contentType = response.headers.get("content-type");
    if (!response.body) {
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(input.targetPath, bytes);
      return { contentType, bytes: bytes.byteLength };
    }

    let bytes = 0;
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += Buffer.byteLength(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as any),
      counter,
      createWriteStream(input.targetPath),
      { signal: abortController.signal },
    );
    return { contentType, bytes };
  } catch (error) {
    await rm(input.targetPath, { force: true }).catch(() => undefined);
    if (abortController.signal.aborted) {
      throw new Error(`PROVIDER_ASSET_DOWNLOAD_TIMEOUT:${timeoutMs}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const persistGeneratedAsset: GeneratedAssetPersister = async (input) => {
  if (isWorkspaceStableUrl(input.workspaceId, input.sourceUrl)) {
    return {
      stableUrl: input.sourceUrl,
      objectKey: null,
      providerTemporaryUrl: null,
      bytes: null,
    };
  }

  const rootName =
    input.kind === "image" ? path.join("materials", "generated-images") : "videos";
  const workspaceLocalPath = await resolveWorkspaceStorageLocalPath(
    input.workspaceId,
  );
  const root = path.join(workspaceLocalPath, ".daireel", rootName);
  await mkdir(root, { recursive: true });

  const dataUrl = parseDataUrl(input.sourceUrl);
  let bytes: Buffer;
  let byteCount: number | null = null;
  let contentType: string | null = null;
  let ext = extensionFromUrl(input.sourceUrl, input.kind);
  let downloadedTempPath: string | null = null;

  if (dataUrl) {
    bytes = dataUrl.bytes;
    byteCount = bytes.byteLength;
    contentType = dataUrl.contentType;
    ext = extensionFromContentType(contentType, input.kind);
  } else if (/^https?:\/\//i.test(input.sourceUrl)) {
    downloadedTempPath = path.join(
      root,
      `${input.batchId}-${input.candidateId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.download`,
    );
    const downloaded = await downloadHttpGeneratedAsset({
      sourceUrl: input.sourceUrl,
      targetPath: downloadedTempPath,
      fetchImpl: input.fetchImpl,
      timeoutMs: input.downloadTimeoutMs,
    });
    contentType = downloaded.contentType;
    byteCount = downloaded.bytes;
    ext = extensionFromContentType(contentType, input.kind);
  } else {
    return {
      stableUrl: input.sourceUrl,
      objectKey: null,
      providerTemporaryUrl: null,
      bytes: null,
    };
  }

  const filename = `${input.batchId}-${input.candidateId}${ext}`;
  const objectKey =
    input.kind === "image"
      ? `materials/generated-images/${filename}`
      : `videos/${filename}`;
  const finalPath = path.join(root, filename);
  if (downloadedTempPath) {
    await rename(downloadedTempPath, finalPath);
  } else {
    await writeFile(finalPath, bytes!);
  }

  return {
    stableUrl:
      input.kind === "image"
        ? `/api/workspaces/${input.workspaceId}/materials/generated-images/${filename}`
        : `/api/workspaces/${input.workspaceId}/videos/${filename}`,
    objectKey,
    providerTemporaryUrl: /^https?:\/\//i.test(input.sourceUrl)
      ? input.sourceUrl
      : null,
    bytes: byteCount,
  };
};
