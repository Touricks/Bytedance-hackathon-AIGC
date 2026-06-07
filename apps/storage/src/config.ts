export interface S3CompatibleConfig {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
}

function boolEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes)$/i.test(value);
}

function requireValue(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required for S3-compatible storage`);
  }
  return value;
}

export function loadS3CompatibleConfig(
  env: NodeJS.ProcessEnv = process.env,
): S3CompatibleConfig {
  const endpoint = env.S3_ENDPOINT?.trim() || undefined;
  const bucket = requireValue("S3_BUCKET", env.S3_BUCKET);
  const accessKeyId = env.S3_ACCESS_KEY?.trim() || undefined;
  const secretAccessKey = env.S3_SECRET_KEY?.trim() || undefined;
  const region = env.S3_REGION?.trim() || "us-east-1";

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY must be configured together");
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    region,
    forcePathStyle: boolEnv(env.S3_FORCE_PATH_STYLE, Boolean(endpoint)),
  };
}
