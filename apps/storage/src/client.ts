import { S3Client } from "@aws-sdk/client-s3";
import type { S3CompatibleConfig } from "./config.js";

export function createS3Client(config: S3CompatibleConfig) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined,
  });
}
