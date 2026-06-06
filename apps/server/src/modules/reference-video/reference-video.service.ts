import net from "node:net";
import { analyzeReferenceVideoRequirements } from "@aigc-video/ai";
import { buildCreativeFactorRequirements } from "@aigc-video/shared";
import { HttpError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { promptRequirementsService } from "../workspace/prompt-requirements.service.js";

const supportedVideoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);

export const maxReferenceVideoBytes = 50 * 1024 * 1024;

export interface ReferenceVideoFileInput {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export interface ReferenceVideoUrlInput {
  url: string;
}

function extensionOf(filename: string) {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
}

function isSupportedVideo(input: { filename?: string; contentType: string }) {
  if (input.contentType.toLowerCase().startsWith("video/")) {
    return true;
  }
  return input.filename
    ? supportedVideoExtensions.has(extensionOf(input.filename))
    : false;
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }
  return false;
}

function parseDownloadUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HttpError(
      400,
      "INVALID_REFERENCE_VIDEO_URL",
      "Reference video URL must be a valid http(s) URL."
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new HttpError(
      400,
      "INVALID_REFERENCE_VIDEO_URL",
      "Reference video URL must use http or https."
    );
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new HttpError(
      400,
      "INVALID_REFERENCE_VIDEO_URL",
      "Reference video URL host is not allowed."
    );
  }
  return parsed;
}

async function ensureImportAllowed(workspaceId: string) {
  await db.getWorkspace(workspaceId);
  const result = await db.db2.pool().query(
    `select id
     from prompt_requirements_artifacts
     where workspace_id = $1
       and status = 'approved'
       and is_current = true
     limit 1`,
    [workspaceId]
  );
  if (result.rows[0]) {
    throw new HttpError(
      409,
      "REQUIREMENTS_ALREADY_APPROVED",
      "Creative requirements are already approved; reference video import is only available before step 1 is submitted."
    );
  }
}

function assertReferenceVideoFile(input: ReferenceVideoFileInput) {
  if (input.bytes.byteLength > maxReferenceVideoBytes) {
    throw new HttpError(
      400,
      "REFERENCE_VIDEO_TOO_LARGE",
      "Reference video exceeds the import size limit."
    );
  }
  if (!isSupportedVideo(input)) {
    throw new HttpError(
      400,
      "UNSUPPORTED_REFERENCE_VIDEO_TYPE",
      "Reference video must be a supported video file."
    );
  }
}

function toVideoDataUrl(contentType: string, bytes: Buffer) {
  return `data:${contentType || "video/mp4"};base64,${bytes.toString("base64")}`;
}

function contentLengthBytes(response: Response) {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function contentType(response: Response) {
  return response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
}

async function createProposedRequirementsFromReferenceVideo(
  workspaceId: string,
  analyzed: Awaited<ReturnType<typeof analyzeReferenceVideoRequirements>>
) {
  const recommendedFactors = analyzed.creativeFactorsRecommendation.recommendedFactors;
  const data = buildCreativeFactorRequirements(recommendedFactors);
  return promptRequirementsService.propose(workspaceId, data);
}

async function readVideoResponseBytes(response: Response) {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.byteLength;
    if (total > maxReferenceVideoBytes) {
      throw new HttpError(
        400,
        "REFERENCE_VIDEO_TOO_LARGE",
        "Reference video exceeds the import size limit."
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function downloadDirectVideo(url: string) {
  const parsed = parseDownloadUrl(url);
  const response = await fetch(parsed);
  if (!response.ok) {
    throw new HttpError(
      400,
      "REFERENCE_VIDEO_NOT_DIRECT_DOWNLOAD",
      "The URL does not point to a directly downloadable video file. Please upload a video file."
    );
  }

  const headerLength = contentLengthBytes(response);
  if (headerLength !== null && headerLength > maxReferenceVideoBytes) {
    throw new HttpError(
      400,
      "REFERENCE_VIDEO_TOO_LARGE",
      "Reference video exceeds the import size limit."
    );
  }

  const type = contentType(response);
  if (!isSupportedVideo({ filename: parsed.pathname, contentType: type })) {
    throw new HttpError(
      400,
      "REFERENCE_VIDEO_NOT_DIRECT_DOWNLOAD",
      "The URL does not point to a directly downloadable video file. Please upload a video file."
    );
  }

  const bytes = await readVideoResponseBytes(response);
  return {
    bytes,
    contentType: type || "video/mp4"
  };
}

export const referenceVideoService = {
  async importFile(workspaceId: string, input: ReferenceVideoFileInput) {
    await ensureImportAllowed(workspaceId);
    assertReferenceVideoFile(input);
    const analyzed = await analyzeReferenceVideoRequirements({
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
      videoUrl: toVideoDataUrl(input.contentType, input.bytes)
    });
    const artifact = await createProposedRequirementsFromReferenceVideo(
      workspaceId,
      analyzed
    );

    return {
      source: {
        type: "file" as const,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength
      },
      ...analyzed,
      artifact
    };
  },

  async importUrl(workspaceId: string, input: ReferenceVideoUrlInput) {
    await ensureImportAllowed(workspaceId);
    const downloaded = await downloadDirectVideo(input.url);
    const analyzed = await analyzeReferenceVideoRequirements({
      filename: new URL(input.url).pathname.split("/").pop() || undefined,
      contentType: downloaded.contentType,
      sizeBytes: downloaded.bytes.byteLength,
      videoUrl: toVideoDataUrl(downloaded.contentType, downloaded.bytes)
    });
    const artifact = await createProposedRequirementsFromReferenceVideo(
      workspaceId,
      analyzed
    );

    return {
      source: {
        type: "url" as const,
        url: input.url,
        downloaded: true,
        contentType: downloaded.contentType,
        sizeBytes: downloaded.bytes.byteLength
      },
      ...analyzed,
      artifact
    };
  }
};
