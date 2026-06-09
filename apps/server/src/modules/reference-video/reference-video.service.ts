import net from "node:net";
import { analyzeReferenceVideoRequirements } from "@aigc-video/ai";
import { DEFAULT_CREATIVE_FACTORS, buildCreativeFactorRequirements } from "@aigc-video/shared";
import { HttpError } from "../../common/errors.js";
import {
  assertImageDimensionsWithinPolicy,
  assertValidRasterImageBytes
} from "../../common/image-validation.js";
import { db } from "../../db/client.js";
import { promptRequirementsService } from "../workspace/prompt-requirements.service.js";

const supportedVideoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const supportedReferenceTextTypes = new Set(["text/plain", "text/markdown"]);
const supportedReferenceTextExtensions = new Set([".txt", ".md"]);

export const maxReferenceVideoBytes = 50 * 1024 * 1024;
export const maxReferenceImageBytes = 10 * 1024 * 1024;
export const maxReferenceFileCount = 6;
const maxReferenceTextChars = 4000;

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

function isImageFile(input: { filename: string; contentType: string }) {
  return input.contentType.toLowerCase().startsWith("image/");
}

function isReferenceTextFile(input: { filename: string; contentType: string }) {
  if (supportedReferenceTextTypes.has(input.contentType.toLowerCase())) {
    return true;
  }
  return supportedReferenceTextExtensions.has(extensionOf(input.filename));
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
  const data = buildCreativeFactorRequirements({
    ...DEFAULT_CREATIVE_FACTORS,
    ...recommendedFactors,
  });
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

  async importReferenceFiles(
    workspaceId: string,
    files: ReferenceVideoFileInput[]
  ) {
    await ensureImportAllowed(workspaceId);
    if (files.length === 0) {
      throw new HttpError(
        400,
        "REFERENCE_FILES_REQUIRED",
        "At least one reference image or text file is required."
      );
    }
    if (files.length > maxReferenceFileCount) {
      throw new HttpError(
        400,
        "TOO_MANY_REFERENCE_FILES",
        `Reference import accepts at most ${maxReferenceFileCount} files.`
      );
    }

    const imageInputs: Array<{ url: string; detail: "high" }> = [];
    const textInputs: Array<{ filename: string; text: string }> = [];
    for (const file of files) {
      if (isImageFile(file)) {
        if (file.bytes.byteLength > maxReferenceImageBytes) {
          throw new HttpError(
            400,
            "REFERENCE_IMAGE_TOO_LARGE",
            "Reference image exceeds the import size limit."
          );
        }
        let mime: string;
        try {
          mime = assertValidRasterImageBytes(file.bytes, file.contentType);
        } catch {
          throw new HttpError(
            400,
            "UNSUPPORTED_REFERENCE_FILE_TYPE",
            `Reference image "${file.filename}" is not a supported image file.`
          );
        }
        assertImageDimensionsWithinPolicy(file.bytes, mime, undefined, file.filename);
        imageInputs.push({
          url: `data:${mime};base64,${file.bytes.toString("base64")}`,
          detail: "high"
        });
      } else if (isReferenceTextFile(file)) {
        textInputs.push({
          filename: file.filename,
          text: file.bytes.toString("utf8").slice(0, maxReferenceTextChars)
        });
      } else {
        throw new HttpError(
          400,
          "UNSUPPORTED_REFERENCE_FILE_TYPE",
          `Reference file "${file.filename}" must be an image or .txt/.md text file.`
        );
      }
    }

    const totalBytes = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
    const analyzed = await analyzeReferenceVideoRequirements({
      filename: files[0]?.filename,
      sizeBytes: totalBytes,
      imageInputs,
      textInputs
    });
    const artifact = await createProposedRequirementsFromReferenceVideo(
      workspaceId,
      analyzed
    );

    return {
      source: {
        type: "files" as const,
        count: files.length,
        filenames: files.map((file) => file.filename),
        totalBytes
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
