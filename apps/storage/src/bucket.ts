import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type BucketLocationConstraint,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { mapWithConcurrency } from "./concurrency.js";

const DELETE_BATCH_SIZE = 1000;
const DELETE_CONCURRENCY = 8;

export async function ensureBucket(input: {
  client: S3Client;
  bucket: string;
  region?: string;
}) {
  try {
    await input.client.send(new HeadBucketCommand({ Bucket: input.bucket }));
    return { bucket: input.bucket, created: false };
  } catch {
    await input.client.send(
      new CreateBucketCommand({
        Bucket: input.bucket,
        CreateBucketConfiguration:
          input.region && input.region !== "us-east-1"
            ? { LocationConstraint: input.region as BucketLocationConstraint }
            : undefined,
      }),
    );
    return { bucket: input.bucket, created: true };
  }
}

export async function putObject(input: {
  client: S3Client;
  bucket: string;
  key: string;
  body: Uint8Array | string;
  contentType?: string;
}) {
  await input.client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
}

export async function getObjectBuffer(input: {
  client: S3Client;
  bucket: string;
  key: string;
}) {
  const response = await input.client.send(
    new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
  );
  const body = response.Body;
  if (!body) return Buffer.alloc(0);
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  const bytes = await (body as { transformToByteArray?: () => Promise<Uint8Array> })
    .transformToByteArray?.();
  return Buffer.from(bytes ?? []);
}

export async function getObjectStream(input: {
  client: S3Client;
  bucket: string;
  key: string;
  range?: string;
}) {
  const response = await input.client.send(
    new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Range: input.range,
    }),
  );
  if (!response.Body) {
    return Readable.from([]);
  }
  if (response.Body instanceof Readable) {
    return response.Body;
  }
  const bytes = await (
    response.Body as { transformToByteArray?: () => Promise<Uint8Array> }
  ).transformToByteArray?.();
  return Readable.from(bytes ? [Buffer.from(bytes)] : []);
}

export async function headObject(input: {
  client: S3Client;
  bucket: string;
  key: string;
}) {
  const response = await input.client.send(
    new HeadObjectCommand({ Bucket: input.bucket, Key: input.key }),
  );
  return {
    contentLength: response.ContentLength ?? null,
    contentType: response.ContentType ?? null,
    lastModified: response.LastModified ?? null,
  };
}

export async function objectExists(input: {
  client: S3Client;
  bucket: string;
  key: string;
}) {
  try {
    await input.client.send(
      new HeadObjectCommand({ Bucket: input.bucket, Key: input.key }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function listObjectKeys(input: {
  client: S3Client;
  bucket: string;
  prefix: string;
  maxKeys?: number;
}) {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await input.client.send(
      new ListObjectsV2Command({
        Bucket: input.bucket,
        Prefix: input.prefix,
        ContinuationToken: continuationToken,
        MaxKeys: input.maxKeys,
      }),
    );
    for (const item of response.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken && (!input.maxKeys || keys.length < input.maxKeys));
  return input.maxKeys ? keys.slice(0, input.maxKeys) : keys;
}

export async function deleteObject(input: {
  client: S3Client;
  bucket: string;
  key: string;
}) {
  await input.client.send(
    new DeleteObjectCommand({ Bucket: input.bucket, Key: input.key }),
  );
}

/**
 * Delete many keys using batched `DeleteObjects` (<=1000 keys/request) with
 * bounded concurrency. Throws an aggregated error naming any keys S3 reported
 * as failed.
 */
export async function deleteObjects(input: {
  client: S3Client;
  bucket: string;
  keys: string[];
  concurrency?: number;
}) {
  if (input.keys.length === 0) return;
  const chunks: string[][] = [];
  for (let i = 0; i < input.keys.length; i += DELETE_BATCH_SIZE) {
    chunks.push(input.keys.slice(i, i + DELETE_BATCH_SIZE));
  }
  const failuresPerChunk = await mapWithConcurrency(
    chunks,
    input.concurrency ?? DELETE_CONCURRENCY,
    async (chunk) => {
      const response = await input.client.send(
        new DeleteObjectsCommand({
          Bucket: input.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      return (response.Errors ?? []).map((error) => error.Key ?? "");
    },
  );
  const failed = failuresPerChunk.flat();
  if (failed.length > 0) {
    throw new Error(
      `Failed to delete ${failed.length} object(s): ${failed.join(", ")}`,
    );
  }
}

/**
 * List every key under `prefix` and delete them in batches. Used to purge a
 * whole workspace prefix without a HEAD-per-object round trip.
 */
export async function deleteObjectsUnderPrefix(input: {
  client: S3Client;
  bucket: string;
  prefix: string;
  concurrency?: number;
}) {
  const keys = await listObjectKeys({
    client: input.client,
    bucket: input.bucket,
    prefix: input.prefix,
  });
  await deleteObjects({
    client: input.client,
    bucket: input.bucket,
    keys,
    concurrency: input.concurrency,
  });
}
