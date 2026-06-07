import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type BucketLocationConstraint,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

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
}) {
  const response = await input.client.send(
    new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
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
