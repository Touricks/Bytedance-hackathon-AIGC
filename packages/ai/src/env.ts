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

export function findWorkspaceEnvFile(startDir = process.cwd()): string | null {
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

export function getWorkspaceRoot(startDir = process.cwd()): string {
  const envFile = findWorkspaceEnvFile(startDir);
  return envFile ? path.dirname(envFile) : path.resolve(startDir);
}

export function resolveWorkspacePath(
  input: string,
  workspaceRoot: string
): string {
  return path.isAbsolute(input) ? input : path.resolve(workspaceRoot, input);
}

export function loadWorkspaceEnv(): string | null {
  if (process.env.AIGC_VIDEO_SKIP_ENV_FILE === "true") {
    return null;
  }

  const envFile = findWorkspaceEnvFile();
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
