import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDiscoveryRoots } from "../modules/workspace/workspace.discovery.js";

function parseDotEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!key) {
    return null;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function findWorkspaceEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function loadWorkspaceEnv(): string | null {
  if (process.env.AIGC_VIDEO_SKIP_ENV_FILE === "true") {
    return null;
  }

  const envFile = findWorkspaceEnvFile(process.cwd());
  if (!envFile) {
    return null;
  }

  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;
    process.env[key] ??= value;
  }

  return path.dirname(envFile);
}

function resolveWorkspacePath(input: string, workspaceRoot: string): string {
  return path.isAbsolute(input) ? input : path.resolve(workspaceRoot, input);
}

function hasUrlScheme(input: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
}

function requireEnv(name: string, reason: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. ${reason}`);
  }
  return value;
}

function validateLocalFilesystemPath(name: string, value: string): string {
  if (hasUrlScheme(value)) {
    throw new Error(
      [
        `${name} must be a local filesystem path for the current local upload storage adapter;`,
        `received ${JSON.stringify(value)}.`,
        "Use a mounted filesystem path here, or add an object-storage adapter before using cloud URLs."
      ].join(" ")
    );
  }
  return value;
}

function normalizeUploadUrlPrefix(input: string): string {
  const prefix = input.trim().replace(/\/+$/, "");
  const isHttpUrl = /^https?:\/\//i.test(prefix);

  if (!prefix || (!prefix.startsWith("/") && !isHttpUrl)) {
    throw new Error(
      "UPLOAD_URL_PREFIX must be an absolute URL path such as /uploads or an http(s) public base URL."
    );
  }

  return prefix;
}

function positiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function workspaceStorageKindEnv(): "local" | "s3" {
  const value = (process.env.WORKSPACE_STORAGE_KIND ?? "local")
    .trim()
    .toLowerCase();
  if (value === "local" || value === "s3") {
    return value;
  }
  throw new Error("WORKSPACE_STORAGE_KIND must be local or s3.");
}

const envFileRoot = loadWorkspaceEnv() ?? process.cwd();
const databaseUrl = requireEnv(
  "DATABASE_URL",
  "Postgres is the only supported business fact source."
);
const legacyUploadDir = process.env.UPLOAD_DIR;
const legacyUploadUrlPrefix = process.env.UPLOAD_URL_PREFIX;
if (Boolean(legacyUploadDir) !== Boolean(legacyUploadUrlPrefix)) {
  throw new Error(
    "UPLOAD_DIR and UPLOAD_URL_PREFIX must be configured together for the legacy upload adapter."
  );
}
const uploadDir = legacyUploadDir
  ? resolveWorkspacePath(
      validateLocalFilesystemPath("UPLOAD_DIR", legacyUploadDir),
      envFileRoot
    )
  : undefined;
const uploadUrlPrefix = legacyUploadUrlPrefix
  ? normalizeUploadUrlPrefix(legacyUploadUrlPrefix)
  : undefined;
const dashboardAssetDir = resolveWorkspacePath(
  process.env.DASHBOARD_ASSET_DIR ?? "storage/dashboard-videos",
  envFileRoot
);
// Dedicated dashboard S3 bucket so dashboard copies never live in a workspace bucket.
// Defaults to the global app bucket when the deployment runs in S3 mode so existing
// S3 deployments keep working; LOCAL deployments leave it undefined (LOCAL dashboard dir).
const dashboardS3Bucket =
  process.env.DASHBOARD_S3_BUCKET?.trim() ||
  (workspaceStorageKindEnv() === "s3" ? process.env.S3_BUCKET?.trim() : undefined) ||
  undefined;
const maxImageCandidatesPerShot = positiveIntEnv("MAX_IMAGE_CANDIDATES_PER_SHOT", 6);
const defaultImageCandidates = Math.min(
  positiveIntEnv("DEFAULT_IMAGE_CANDIDATES", 3),
  maxImageCandidatesPerShot
);
const maxVideoCandidatesPerShot = positiveIntEnv("MAX_VIDEO_CANDIDATES_PER_SHOT", 5);
const defaultVideoCandidates = Math.min(
  positiveIntEnv("DEFAULT_VIDEO_CANDIDATES", 2),
  maxVideoCandidatesPerShot
);
const textProviderConcurrency = positiveIntEnv("TEXT_PROVIDER_CONCURRENCY", 20);
const imageProviderConcurrency = positiveIntEnv(
  "IMAGE_PROVIDER_CONCURRENCY",
  maxImageCandidatesPerShot * 2
);
const videoProviderConcurrency = positiveIntEnv("VIDEO_PROVIDER_CONCURRENCY", 5);
const generationWorkerConcurrency = positiveIntEnv(
  "GENERATION_WORKER_CONCURRENCY",
  imageProviderConcurrency + videoProviderConcurrency
);

export const config = {
  port: Number(process.env.SERVER_PORT ?? 3000),
  databaseUrl,
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  useRedisQueue: process.env.USE_REDIS_QUEUE === "true",
  runtime: process.env.SERVER_RUNTIME ?? "all",
  uploadDir,
  uploadUrlPrefix,
  dashboardAssetDir,
  dashboardS3Bucket,
  defaultImageCandidates,
  maxImageCandidatesPerShot,
  defaultVideoCandidates,
  maxVideoCandidatesPerShot,
  generationWorkerConcurrency,
  textProviderConcurrency,
  imageProviderConcurrency,
  videoProviderConcurrency,
  workspaceDiscoveryRoots: parseDiscoveryRoots(process.env.WORKSPACE_DISCOVERY_ROOTS),
  workspaceStorageKind: workspaceStorageKindEnv(),
};

export function shouldStartApi(): boolean {
  return config.runtime === "all" || config.runtime === "api";
}

export function shouldStartWorker(): boolean {
  return config.runtime === "all" || config.runtime === "worker";
}
