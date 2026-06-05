import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  deleteObject,
  getObjectBuffer,
  getObjectStream,
  headObject,
  listObjectKeys,
  objectExists,
  putObject,
  createS3Client,
  loadS3CompatibleConfig,
} from "@aigc-video/storage";
import type { WorkspaceStorageBindingRow } from "../../../db/client.js";
import { HttpError } from "../../../common/errors.js";
import type {
  WorkspaceStorageAdapter,
  WorkspaceStorageObjectInfo,
} from "./workspace-storage.adapter.js";
import {
  joinObjectKey,
  normalizeWorkspaceRelativePath,
  stripObjectKeyPrefix,
} from "./workspace-storage.keys.js";

function toInfo(
  relativePath: string,
  input: {
    contentLength?: number | null;
    contentType?: string | null;
    lastModified?: Date | null;
  },
): WorkspaceStorageObjectInfo {
  return {
    relativePath,
    size: input.contentLength ?? null,
    contentType: input.contentType ?? null,
    lastModified: input.lastModified ?? null,
  };
}

function isS3NotFound(error: unknown) {
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

function rethrowStorageError(error: unknown, relativePath: string): never {
  if (isS3NotFound(error)) {
    throw new HttpError(
      404,
      "STORAGE_OBJECT_NOT_FOUND",
      `Workspace storage object not found: ${relativePath}`,
    );
  }
  throw error;
}

export class S3WorkspaceStorageAdapter implements WorkspaceStorageAdapter {
  kind = "S3" as const;
  binding: WorkspaceStorageBindingRow;
  private bucket: string;
  private prefix: string;
  private client = createS3Client(loadS3CompatibleConfig());

  constructor(binding: WorkspaceStorageBindingRow) {
    if (!binding.s3Bucket || !binding.s3Prefix) {
      throw new HttpError(409, "STORAGE_NOT_BOUND", "S3 storage binding is incomplete");
    }
    this.binding = binding;
    this.bucket = binding.s3Bucket;
    this.prefix = binding.s3Prefix;
  }

  private keyFor(relativePath: string) {
    return {
      relativePath: normalizeWorkspaceRelativePath(relativePath),
      key: joinObjectKey(this.prefix, relativePath),
    };
  }

  async putObject(input: {
    relativePath: string;
    body: Uint8Array | string;
    contentType?: string;
  }) {
    const { relativePath, key } = this.keyFor(input.relativePath);
    await putObject({
      client: this.client,
      bucket: this.bucket,
      key,
      body: input.body,
      contentType: input.contentType,
    });
    const metadata = await headObject({
      client: this.client,
      bucket: this.bucket,
      key,
    });
    return toInfo(relativePath, metadata);
  }

  async readObject(relativePath: string) {
    const { key } = this.keyFor(relativePath);
    try {
      return await getObjectBuffer({ client: this.client, bucket: this.bucket, key });
    } catch (error) {
      rethrowStorageError(error, relativePath);
    }
  }

  async streamObject(relativePath: string) {
    const { key } = this.keyFor(relativePath);
    try {
      return await getObjectStream({ client: this.client, bucket: this.bucket, key });
    } catch (error) {
      rethrowStorageError(error, relativePath);
    }
  }

  async deleteObject(relativePath: string) {
    const { key } = this.keyFor(relativePath);
    await deleteObject({ client: this.client, bucket: this.bucket, key });
  }

  async listObjects(prefix: string) {
    const normalizedPrefix = prefix
      ? normalizeWorkspaceRelativePath(prefix)
      : "";
    const keyPrefix = normalizedPrefix
      ? joinObjectKey(this.prefix, normalizedPrefix)
      : `${this.prefix.replace(/\/+$/g, "")}/`;
    const keys = await listObjectKeys({
      client: this.client,
      bucket: this.bucket,
      prefix: keyPrefix,
    });
    return Promise.all(
      keys.flatMap((key) => {
        const relativePath = stripObjectKeyPrefix(this.prefix, key);
        return relativePath ? [this.statObject(relativePath)] : [];
      }),
    );
  }

  async statObject(relativePath: string) {
    const { relativePath: safePath, key } = this.keyFor(relativePath);
    try {
      const metadata = await headObject({
        client: this.client,
        bucket: this.bucket,
        key,
      });
      return toInfo(safePath, metadata);
    } catch (error) {
      rethrowStorageError(error, relativePath);
    }
  }

  async exists(relativePath: string) {
    const { key } = this.keyFor(relativePath);
    return objectExists({ client: this.client, bucket: this.bucket, key });
  }

  async downloadToTemp(relativePath: string, targetPath: string) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    const stream = await this.streamObject(relativePath);
    await pipeline(stream, createWriteStream(targetPath));
  }

  async deletePrefix(prefix: string) {
    const objects = await this.listObjects(prefix);
    await Promise.all(objects.map((item) => this.deleteObject(item.relativePath)));
  }
}
