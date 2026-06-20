import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  createS3Client,
  getObjectStream,
  headObject,
  loadS3CompatibleConfig,
  putObject,
} from "@aigc-video/storage";
import { config } from "../../common/config.js";
import { HttpError, NotFoundError } from "../../common/errors.js";
import type { WorkspaceStorageAdapter } from "../workspace/storage/workspace-storage.adapter.js";

export type DashboardAssetStorageKind = "LOCAL" | "S3";

export interface DashboardAssetLocator {
  storageKind: DashboardAssetStorageKind;
  storageBucket: string | null;
  videoObjectKey: string | null;
  metadataObjectKey: string | null;
  localAssetDir: string | null;
}

interface DashboardS3Ops {
  putObject(input: {
    bucket: string;
    key: string;
    body: Uint8Array | string;
    contentType?: string;
  }): Promise<void>;
  getObjectStream(input: {
    bucket: string;
    key: string;
    range?: string;
  }): Promise<Readable>;
  headObject?(input: {
    bucket: string;
    key: string;
  }): Promise<{ contentLength: number | null; contentType?: string | null }>;
}

export interface DashboardVideoStream {
  stream: Readable;
  statusCode: 200 | 206;
  headers: Record<string, string | number>;
}

interface ByteRange {
  start: number;
  end: number;
}

let dashboardS3OpsOverride: DashboardS3Ops | undefined;

export function __setDashboardS3OpsForTests(ops: DashboardS3Ops | undefined) {
  dashboardS3OpsOverride = ops;
}

function isInsideDirectory(filePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, filePath);
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isNodeNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isS3NotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const statusCode =
    "$metadata" in error &&
    error.$metadata &&
    typeof error.$metadata === "object" &&
    "httpStatusCode" in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : null;
  return name === "NoSuchKey" || name === "NotFound" || statusCode === 404;
}

function dashboardArtifactDir(artifactId: string) {
  const rootPath = path.resolve(config.dashboardAssetDir);
  const dir = path.resolve(rootPath, artifactId);
  if (!isInsideDirectory(dir, rootPath)) {
    throw new HttpError(
      400,
      "INVALID_DASHBOARD_ARTIFACT_ID",
      "Dashboard artifact id must stay inside the dashboard asset root",
    );
  }
  return dir;
}

function safeDashboardObjectKey(artifactId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(artifactId)) {
    throw new HttpError(
      400,
      "INVALID_DASHBOARD_ARTIFACT_ID",
      "Dashboard artifact id must be safe to use as a dashboard object key",
    );
  }
  return artifactId;
}

export function dashboardObjectKeys(artifactId: string) {
  const objectKey = safeDashboardObjectKey(artifactId);
  return {
    videoObjectKey: `dashboard/${objectKey}/video.mp4`,
    metadataObjectKey: `dashboard/${objectKey}/metadata.json`,
  };
}

function dashboardArtifactVideoPath(artifactId: string) {
  return path.join(dashboardArtifactDir(artifactId), "video.mp4");
}

function dashboardArtifactMetadataPath(artifactId: string) {
  return path.join(dashboardArtifactDir(artifactId), "metadata.json");
}

async function putDashboardS3Object(input: {
  bucket: string;
  key: string;
  body: Uint8Array | string;
  contentType?: string;
}) {
  if (dashboardS3OpsOverride) {
    await dashboardS3OpsOverride.putObject(input);
    return;
  }
  await putObject({
    client: createS3Client(loadS3CompatibleConfig()),
    bucket: input.bucket,
    key: input.key,
    body: input.body,
    contentType: input.contentType,
  });
}

async function headDashboardS3Object(input: { bucket: string; key: string }) {
  if (dashboardS3OpsOverride?.headObject) {
    return dashboardS3OpsOverride.headObject(input);
  }
  return headObject({
    client: createS3Client(loadS3CompatibleConfig()),
    bucket: input.bucket,
    key: input.key,
  });
}

async function getDashboardS3RangedObjectStream(input: {
  bucket: string;
  key: string;
  range?: string;
}) {
  if (dashboardS3OpsOverride) {
    return dashboardS3OpsOverride.getObjectStream(input);
  }
  return getObjectStream({
    client: createS3Client(loadS3CompatibleConfig()),
    bucket: input.bucket,
    key: input.key,
    range: input.range,
  });
}

export function dashboardLocalLocator(artifactId: string): DashboardAssetLocator {
  return {
    storageKind: "LOCAL",
    storageBucket: null,
    videoObjectKey: null,
    metadataObjectKey: null,
    localAssetDir: dashboardArtifactDir(artifactId),
  };
}

export function dashboardS3Locator(artifactId: string): DashboardAssetLocator {
  const bucket = config.dashboardS3Bucket;
  if (!bucket) {
    throw new HttpError(
      409,
      "DASHBOARD_S3_NOT_CONFIGURED",
      "DASHBOARD_S3_BUCKET is not configured",
    );
  }
  const keys = dashboardObjectKeys(artifactId);
  return {
    storageKind: "S3",
    storageBucket: bucket,
    videoObjectKey: keys.videoObjectKey,
    metadataObjectKey: keys.metadataObjectKey,
    localAssetDir: null,
  };
}

export function dashboardConfiguredLocator(
  artifactId: string,
): DashboardAssetLocator {
  return config.dashboardS3Bucket
    ? dashboardS3Locator(artifactId)
    : dashboardLocalLocator(artifactId);
}

export async function persistDashboardVideoAsset(input: {
  artifactId: string;
  sourceStorage: WorkspaceStorageAdapter;
  sourceRelativePath: string;
  metadata: (locator: DashboardAssetLocator) => Record<string, unknown>;
}) {
  const videoBody = await input.sourceStorage.readObject(input.sourceRelativePath);
  // The dashboard target is dashboard-owned (dedicated bucket vs global dir),
  // independent of which storage the source workspace happens to use.
  const locator = dashboardConfiguredLocator(input.artifactId);
  return persistDashboardVideoAssetBytes({
    artifactId: input.artifactId,
    locator,
    videoBody,
    metadata: input.metadata,
  });
}

export async function persistDashboardVideoAssetBytes(input: {
  artifactId: string;
  locator: DashboardAssetLocator;
  videoBody: Uint8Array;
  metadata: (locator: DashboardAssetLocator) => Record<string, unknown>;
}) {
  const metadataBody = `${JSON.stringify(input.metadata(input.locator), null, 2)}\n`;

  if (input.locator.storageKind === "S3") {
    await putDashboardS3Object({
      bucket: input.locator.storageBucket ?? "",
      key: input.locator.videoObjectKey ?? "",
      body: input.videoBody,
      contentType: "video/mp4",
    });
    await putDashboardS3Object({
      bucket: input.locator.storageBucket ?? "",
      key: input.locator.metadataObjectKey ?? "",
      body: metadataBody,
      contentType: "application/json",
    });
    return input.locator;
  }

  const assetDir = dashboardArtifactDir(input.artifactId);
  await mkdir(assetDir, { recursive: true });
  await writeFile(dashboardArtifactVideoPath(input.artifactId), input.videoBody);
  await writeFile(dashboardArtifactMetadataPath(input.artifactId), metadataBody);
  return input.locator;
}

function contentRangeHeader(range: ByteRange, size: number) {
  return `bytes ${range.start}-${range.end}/${size}`;
}

function s3RangeHeader(range: ByteRange) {
  return `bytes=${range.start}-${range.end}`;
}

function parseDashboardVideoRange(
  rangeHeader: string | undefined,
  size: number,
): ByteRange | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || rangeHeader.includes(",")) {
    throw new HttpError(
      416,
      "DASHBOARD_VIDEO_RANGE_NOT_SATISFIABLE",
      "Dashboard video range is not satisfiable",
    );
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    throw new HttpError(
      416,
      "DASHBOARD_VIDEO_RANGE_NOT_SATISFIABLE",
      "Dashboard video range is not satisfiable",
    );
  }

  if (size <= 0) {
    throw new HttpError(
      416,
      "DASHBOARD_VIDEO_RANGE_NOT_SATISFIABLE",
      "Dashboard video range is not satisfiable",
    );
  }

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new HttpError(
        416,
        "DASHBOARD_VIDEO_RANGE_NOT_SATISFIABLE",
        "Dashboard video range is not satisfiable",
      );
    }
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number(rawStart);
  const requestedEnd = rawEnd ? Number(rawEnd) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    throw new HttpError(
      416,
      "DASHBOARD_VIDEO_RANGE_NOT_SATISFIABLE",
      "Dashboard video range is not satisfiable",
    );
  }

  return {
    start,
    end: Math.min(requestedEnd, size - 1),
  };
}

function streamHeaders(input: {
  size: number | null;
  range: ByteRange | null;
}): Pick<DashboardVideoStream, "statusCode" | "headers"> {
  const baseHeaders: Record<string, string | number> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
  };
  if (!input.range) {
    if (input.size !== null) baseHeaders["Content-Length"] = input.size;
    return { statusCode: 200, headers: baseHeaders };
  }

  const contentLength = input.range.end - input.range.start + 1;
  return {
    statusCode: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": contentLength,
      "Content-Range": contentRangeHeader(input.range, input.size ?? 0),
    },
  };
}

export async function streamDashboardVideoAsset(row: {
  id: string;
  storage_kind?: unknown;
  storage_bucket?: unknown;
  video_object_key?: unknown;
}, options: { rangeHeader?: string } = {}): Promise<DashboardVideoStream> {
  if (row.storage_kind === "S3") {
    const bucket = typeof row.storage_bucket === "string" ? row.storage_bucket : null;
    const key =
      typeof row.video_object_key === "string" ? row.video_object_key : null;
    if (!bucket || !key) throw new NotFoundError("DashboardVideoFile");
    try {
      const metadata = await headDashboardS3Object({ bucket, key });
      const size = metadata.contentLength;
      if (options.rangeHeader && typeof size !== "number") {
        throw new HttpError(
          416,
          "DASHBOARD_VIDEO_RANGE_NOT_SATISFIABLE",
          "Dashboard video range is not satisfiable",
        );
      }
      const range =
        typeof size === "number"
          ? parseDashboardVideoRange(options.rangeHeader, size)
          : null;
      const stream = await getDashboardS3RangedObjectStream({
        bucket,
        key,
        range: range ? s3RangeHeader(range) : undefined,
      });
      return {
        stream,
        ...streamHeaders({ size, range }),
      };
    } catch (error) {
      if (isS3NotFoundError(error)) throw new NotFoundError("DashboardVideoFile");
      throw error;
    }
  }

  const videoPath = dashboardArtifactVideoPath(String(row.id));
  let size: number;
  try {
    size = (await stat(videoPath)).size;
  } catch (error) {
    if (isNodeNotFoundError(error)) throw new NotFoundError("DashboardVideoFile");
    throw error;
  }
  const range = parseDashboardVideoRange(options.rangeHeader, size);
  return {
    stream: range
      ? createReadStream(videoPath, { start: range.start, end: range.end })
      : createReadStream(videoPath),
    ...streamHeaders({ size, range }),
  };
}
