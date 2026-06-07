import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ensureBucket, deleteObject, getObjectBuffer, listObjectKeys, objectExists, putObject } from "./bucket.js";
import { createS3Client } from "./client.js";
import { loadS3CompatibleConfig } from "./config.js";

const config = loadS3CompatibleConfig({
  ...process.env,
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  S3_REGION: process.env.S3_REGION ?? "us-east-1",
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? "true",
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "minioadmin",
  S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "minioadmin",
  S3_BUCKET: process.env.S3_BUCKET ?? "aigc-video",
});
const client = createS3Client(config);
const key = `smoke/${randomUUID()}.txt`;
const body = `storage-smoke:${new Date().toISOString()}`;

await ensureBucket({
  client,
  bucket: config.bucket,
  region: config.region,
});
await putObject({
  client,
  bucket: config.bucket,
  key,
  body,
  contentType: "text/plain",
});

assert.equal(await objectExists({ client, bucket: config.bucket, key }), true);
assert.equal(
  (await getObjectBuffer({ client, bucket: config.bucket, key })).toString("utf8"),
  body,
);
assert.ok(
  (await listObjectKeys({ client, bucket: config.bucket, prefix: "smoke/" })).includes(key),
);
await deleteObject({ client, bucket: config.bucket, key });
assert.equal(await objectExists({ client, bucket: config.bucket, key }), false);

console.log(
  JSON.stringify(
    {
      ok: true,
      bucket: config.bucket,
      endpoint: config.endpoint ?? "default",
      forcePathStyle: config.forcePathStyle,
    },
    null,
    2,
  ),
);
