import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../common/config.js";
import { db } from "../../db/client.js";
import type { DiscoveredWorkspace } from "./workspace.discovery.js";
import {
  workspaceManifestSchema,
  type WorkspaceManifest,
} from "./workspace.schema.js";

export const workspaceManifestRelativePath = path.join(
  ".daireel",
  "workspace.json",
);
export const workspaceTraceFile = ".daireel/trace/events.jsonl" as const;

const discoveryIgnoredDirs = new Set([
  "node_modules",
  ".git",
  ".daireel",
  ".turbo",
  "dist",
  "coverage",
]);

export function normalizeWorkspacePath(directory: string) {
  return path.resolve(directory);
}

export function isInsideDirectory(filePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, filePath);
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

export function isWorkspaceVisibleInConfiguredRoots(localPath: string) {
  const trimmed = localPath.trim();
  if (!trimmed) return false;
  if (config.workspaceDiscoveryRoots.length === 0) return true;

  const normalizedPath = normalizeWorkspacePath(trimmed);
  return config.workspaceDiscoveryRoots.some((root) => {
    const normalizedRoot = normalizeWorkspacePath(root);
    return (
      normalizedPath === normalizedRoot ||
      isInsideDirectory(normalizedPath, normalizedRoot)
    );
  });
}

export function manifestPath(directory: string) {
  return path.join(directory, workspaceManifestRelativePath);
}

export function toManifest(input: {
  workspaceId: string;
  currentScriptId: string;
  currentJobId?: string;
}): WorkspaceManifest {
  return {
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    currentScriptId: input.currentScriptId,
    currentJobId: input.currentJobId,
    traceFile: workspaceTraceFile,
  };
}

export async function writeManifest(
  directory: string,
  manifest: WorkspaceManifest,
) {
  await mkdir(path.dirname(manifestPath(directory)), { recursive: true });
  await writeFile(
    manifestPath(directory),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export async function readManifest(directory: string) {
  const raw = await readFile(manifestPath(directory), "utf8");
  return workspaceManifestSchema.parse(JSON.parse(raw));
}

export async function readManifestSafe(
  directory: string,
): Promise<WorkspaceManifest | null> {
  try {
    return await readManifest(directory);
  } catch {
    return null;
  }
}

export async function workspaceIdInUse(workspaceId: string): Promise<boolean> {
  try {
    await db.getWorkspace(workspaceId);
    return true;
  } catch {
    return false;
  }
}

export async function scanForWorkspaceManifests(
  roots: string[],
  maxDepth: number,
): Promise<DiscoveredWorkspace[]> {
  const found: DiscoveredWorkspace[] = [];
  const visited = new Set<string>();

  async function walk(directory: string, depth: number): Promise<void> {
    const normalized = normalizeWorkspacePath(directory);
    if (visited.has(normalized)) return;
    visited.add(normalized);

    const manifest = await readManifestSafe(normalized);
    if (manifest) {
      found.push({ localPath: normalized, workspaceId: manifest.workspaceId });
      return;
    }
    if (depth >= maxDepth) return;

    let entries;
    try {
      entries = await readdir(normalized, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || discoveryIgnoredDirs.has(entry.name)) {
        continue;
      }
      await walk(path.join(normalized, entry.name), depth + 1);
    }
  }

  for (const root of roots) {
    await walk(root, 0);
  }
  return found;
}
