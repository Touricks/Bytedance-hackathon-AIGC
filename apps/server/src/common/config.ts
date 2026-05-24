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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required. Postgres is the only supported V0 fact source.`
    );
  }
  return value;
}

const workspaceRoot = loadWorkspaceEnv() ?? process.cwd();

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.SERVER_PORT ?? 3000),
  databaseUrl: requireEnv("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  useRedisQueue: process.env.USE_REDIS_QUEUE === "true",
  runtime: process.env.SERVER_RUNTIME ?? "all",
  uploadDir: resolveWorkspacePath(
    process.env.UPLOAD_DIR ?? "tmp/uploads",
    workspaceRoot
  )
};

export function shouldStartApi(): boolean {
  return config.runtime === "all" || config.runtime === "api";
}

export function shouldStartWorker(): boolean {
  return config.runtime === "all" || config.runtime === "worker";
}
