import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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

function requireLocalFilesystemPath(name: string, reason: string): string {
  const value = requireEnv(name, reason);
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

const workspaceRoot = loadWorkspaceEnv() ?? process.cwd();

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.SERVER_PORT ?? 3000),
  databaseUrl: requireEnv(
    "DATABASE_URL",
    "Postgres is the only supported V0 fact source."
  ),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  useRedisQueue: process.env.USE_REDIS_QUEUE === "true",
  runtime: process.env.SERVER_RUNTIME ?? "all",
  uploadDir: resolveWorkspacePath(
    requireLocalFilesystemPath(
      "UPLOAD_DIR",
      "Local file upload storage must be explicit; no tmp/uploads fallback is allowed."
    ),
    workspaceRoot
  ),
  uploadUrlPrefix: normalizeUploadUrlPrefix(
    requireEnv(
      "UPLOAD_URL_PREFIX",
      "Upload URL prefix must be explicit so local filesystem paths are not confused with public asset URLs."
    )
  )
};

export function shouldStartApi(): boolean {
  return config.runtime === "all" || config.runtime === "api";
}

export function shouldStartWorker(): boolean {
  return config.runtime === "all" || config.runtime === "worker";
}
