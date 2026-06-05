import path from "node:path";
import { HttpError } from "../../../common/errors.js";

export function normalizeWorkspaceRelativePath(input: string) {
  const normalized = input
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part.length > 0)
    .join("/");
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new HttpError(
      400,
      "INVALID_WORKSPACE_STORAGE_PATH",
      "Workspace storage path must be a safe relative path",
    );
  }
  return normalized;
}

export function joinObjectKey(prefix: string, relativePath: string) {
  const normalizedPrefix = prefix
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath);
  return normalizedPrefix ? `${normalizedPrefix}/${normalizedPath}` : normalizedPath;
}

export function stripObjectKeyPrefix(prefix: string, key: string) {
  const normalizedPrefix = prefix
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!normalizedPrefix) return key;
  const fullPrefix = `${normalizedPrefix}/`;
  return key.startsWith(fullPrefix) ? key.slice(fullPrefix.length) : null;
}
