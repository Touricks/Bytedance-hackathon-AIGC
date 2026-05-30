import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveWorkspaceStorageLocalPath } from "../workspace/workspace.service.js";

type GeneratedAssetKind = "image" | "video";

export interface PersistGeneratedAssetResult {
  stableUrl: string;
  objectKey: string | null;
  providerTemporaryUrl: string | null;
}

export type GeneratedAssetPersister = (input: {
  workspaceId: string;
  sourceUrl: string;
  kind: GeneratedAssetKind;
  batchId: string;
  candidateId: string;
  fetchImpl?: typeof fetch;
}) => Promise<PersistGeneratedAssetResult>;

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

export const persistGeneratedAsset: GeneratedAssetPersister = async (input) => {
  if (isWorkspaceStableUrl(input.workspaceId, input.sourceUrl)) {
    return {
      stableUrl: input.sourceUrl,
      objectKey: null,
      providerTemporaryUrl: null,
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
  let contentType: string | null = null;
  let ext = extensionFromUrl(input.sourceUrl, input.kind);

  if (dataUrl) {
    bytes = dataUrl.bytes;
    contentType = dataUrl.contentType;
    ext = extensionFromContentType(contentType, input.kind);
  } else if (/^https?:\/\//i.test(input.sourceUrl)) {
    const response = await (input.fetchImpl ?? fetch)(input.sourceUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to persist provider ${input.kind} URL ${response.status}`,
      );
    }
    contentType = response.headers.get("content-type");
    bytes = Buffer.from(await response.arrayBuffer());
    ext = extensionFromContentType(contentType, input.kind);
  } else {
    return {
      stableUrl: input.sourceUrl,
      objectKey: null,
      providerTemporaryUrl: null,
    };
  }

  const filename = `${input.batchId}-${input.candidateId}${ext}`;
  const objectKey =
    input.kind === "image"
      ? `materials/generated-images/${filename}`
      : `videos/${filename}`;
  await writeFile(path.join(root, filename), bytes);

  return {
    stableUrl:
      input.kind === "image"
        ? `/api/workspaces/${input.workspaceId}/materials/generated-images/${filename}`
        : `/api/workspaces/${input.workspaceId}/videos/${filename}`,
    objectKey,
    providerTemporaryUrl: /^https?:\/\//i.test(input.sourceUrl)
      ? input.sourceUrl
      : null,
  };
};
