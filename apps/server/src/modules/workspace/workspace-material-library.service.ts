import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  MaterialAsset,
  MaterialIntakeArtifact,
} from "@aigc-video/shared";
import {
  assertImageDimensionsWithinPolicy,
  assertValidRasterImageBytes,
} from "../../common/image-validation.js";
import type { WorkspaceStorageAdapter } from "./storage/workspace-storage.adapter.js";
import { getWorkspaceStorageAdapter } from "./storage/workspace-storage-resolver.js";

export const maxWorkspaceMaterialBytes = 50 * 1024 * 1024;
export const maxModelImageMaterialBytes = 10 * 1024 * 1024;

const workspaceMaterialsRelativePath = path.join(".daireel", "materials");

const mimeByExtension: Record<string, string> = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".md": "text/markdown",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

export function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function workspaceMaterialsPath(directory: string) {
  return path.join(directory, workspaceMaterialsRelativePath);
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

export function classifyKind(mime: string): MaterialAsset["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "text";
}

export function normalizeMaterialFilename(filename: string) {
  const normalized = path.basename(filename);
  if (normalized !== filename || normalized === "." || normalized === "..") {
    throw new Error("Workspace material filename must not include a path");
  }
  if (normalized.startsWith(".")) {
    throw new Error("Workspace material filename must not be hidden");
  }
  return normalized;
}

export function workspaceMaterialMime(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  const mime = mimeByExtension[ext];
  if (!mime) {
    throw new Error("Unsupported material type");
  }
  return mime;
}

function defaultRole(kind: MaterialAsset["kind"], hasPrimaryImage: boolean) {
  if (kind === "image") {
    return hasPrimaryImage ? "reference" : "product_main";
  }
  if (kind === "video") {
    return "demo_video";
  }
  return "spec_text";
}

export function materialUrl(workspaceId: string, ref: string) {
  return `/api/workspaces/${workspaceId}/materials/${encodeURIComponent(ref)}`;
}

export function applySelectedMaterialRefs(
  materialLibrary: {
    primaryProductRef?: string;
    assets: MaterialAsset[];
    rejected: Array<{ ref: string; reason: string }>;
    scannedAt: string;
  },
  selectedRefs?: string[],
) {
  if (!selectedRefs || selectedRefs.length === 0) {
    return materialLibrary;
  }
  const selectedRefSet = new Set(selectedRefs);
  const knownRefs = new Set(materialLibrary.assets.map((asset) => asset.ref));
  const invalidRefs = selectedRefs.filter((ref) => !knownRefs.has(ref));
  if (invalidRefs.length > 0) {
    throw new Error(`Invalid selected material refs: ${invalidRefs.join(", ")}`);
  }
  const assets = materialLibrary.assets.filter((asset) =>
    selectedRefSet.has(asset.ref),
  );
  const primaryProductRef =
    assets.find((asset) => asset.ref === materialLibrary.primaryProductRef)
      ?.ref ??
    assets.find((asset) => asset.kind === "image")?.ref ??
    assets[0]?.ref ??
    "";

  return {
    ...materialLibrary,
    ...(primaryProductRef ? { primaryProductRef } : {}),
    assets,
  };
}

export async function copySelectedLegacyRootMaterials(input: {
  directory: string;
  selectedMaterialRefs?: string[];
}) {
  if (!input.selectedMaterialRefs || input.selectedMaterialRefs.length === 0) {
    return;
  }
  const materialDirectory = workspaceMaterialsPath(input.directory);
  await mkdir(materialDirectory, { recursive: true });
  for (const ref of input.selectedMaterialRefs) {
    const filename = normalizeMaterialFilename(ref);
    try {
      workspaceMaterialMime(filename);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Unsupported material type"
      ) {
        continue;
      }
      throw error;
    }
    const source = path.join(input.directory, filename);
    if (!(await fileExists(source))) {
      continue;
    }
    const sourceStats = await stat(source);
    if (!sourceStats.isFile()) {
      continue;
    }
    if (sourceStats.size > maxWorkspaceMaterialBytes) {
      throw new Error("Material file exceeds 50MB limit");
    }

    const destination = path.join(materialDirectory, filename);
    if (await fileExists(destination)) {
      const destinationStats = await stat(destination);
      if (destinationStats.size === sourceStats.size) {
        const [sourceBytes, destinationBytes] = await Promise.all([
          readFile(source),
          readFile(destination),
        ]);
        if (sourceBytes.equals(destinationBytes)) {
          continue;
        }
      }
    }

    if (source === destination) {
      continue;
    }
    await copyFile(source, destination);
  }
}

async function collectMaterialLibraryFromDirectory(materialDirectory: string) {
  let entries: Dirent[];
  try {
    entries = await readdir(materialDirectory, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const accepted: MaterialAsset[] = [];
  const rejected: Array<{ ref: string; reason: string }> = [];
  let hasPrimaryImage = false;

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }
    let mime: string;
    try {
      mime = workspaceMaterialMime(entry.name);
    } catch {
      rejected.push({ ref: entry.name, reason: "Unsupported material type" });
      continue;
    }

    const filePath = path.join(materialDirectory, entry.name);
    const fileStats = await stat(filePath);
    if (fileStats.size > maxWorkspaceMaterialBytes) {
      rejected.push({ ref: entry.name, reason: "Material file exceeds 50MB limit" });
      continue;
    }

    const bytes = await readFile(filePath);
    const kind = classifyKind(mime);
    if (kind === "image") {
      try {
        assertValidRasterImageBytes(bytes, mime);
      } catch (error) {
        rejected.push({
          ref: entry.name,
          reason: error instanceof Error ? error.message : "Invalid image material",
        });
        continue;
      }
    }

    const role = defaultRole(kind, hasPrimaryImage);
    if (role === "product_main") {
      hasPrimaryImage = true;
    }

    accepted.push({
      ref: entry.name,
      kind,
      mime,
      bytes: fileStats.size,
      sha256: sha256(bytes),
      role,
      description: `Accepted ${kind} asset ${entry.name}`,
      relevance: role === "product_main" ? "high" : "medium",
      usable: true,
      included: true,
    });
  }

  const primaryProductRef =
    accepted.find((asset) => asset.role === "product_main")?.ref ??
    accepted.find((asset) => asset.kind === "image")?.ref ??
    accepted[0]?.ref ??
    "";

  return {
    scannedAt: new Date().toISOString(),
    ...(primaryProductRef ? { primaryProductRef } : {}),
    assets: accepted,
    rejected,
  };
}

async function collectMaterialLibraryFromStorage(
  adapter: WorkspaceStorageAdapter,
) {
  const objects = await adapter.listObjects("materials");
  const directMaterialObjects = objects
    .filter((object) => object.relativePath.startsWith("materials/"))
    .map((object) => ({
      object,
      ref: object.relativePath.slice("materials/".length),
    }))
    .filter(({ ref }) => ref && !ref.includes("/") && !ref.startsWith("."))
    .sort((a, b) => a.ref.localeCompare(b.ref));

  const accepted: MaterialAsset[] = [];
  const rejected: Array<{ ref: string; reason: string }> = [];
  let hasPrimaryImage = false;

  for (const { object, ref } of directMaterialObjects) {
    let mime: string;
    try {
      mime = workspaceMaterialMime(ref);
    } catch {
      rejected.push({ ref, reason: "Unsupported material type" });
      continue;
    }

    const size = object.size ?? 0;
    if (size > maxWorkspaceMaterialBytes) {
      rejected.push({ ref, reason: "Material file exceeds 50MB limit" });
      continue;
    }

    const bytes = await adapter.readObject(`materials/${ref}`);
    const kind = classifyKind(mime);
    if (kind === "image") {
      try {
        assertValidRasterImageBytes(bytes, mime);
      } catch (error) {
        rejected.push({
          ref,
          reason: error instanceof Error ? error.message : "Invalid image material",
        });
        continue;
      }
    }

    const role = defaultRole(kind, hasPrimaryImage);
    if (role === "product_main") {
      hasPrimaryImage = true;
    }

    accepted.push({
      ref,
      kind,
      mime,
      bytes: size,
      sha256: sha256(bytes),
      role,
      description: `Accepted ${kind} asset ${ref}`,
      relevance: role === "product_main" ? "high" : "medium",
      usable: true,
      included: true,
    });
  }

  const primaryProductRef =
    accepted.find((asset) => asset.role === "product_main")?.ref ??
    accepted.find((asset) => asset.kind === "image")?.ref ??
    accepted[0]?.ref ??
    "";

  return {
    scannedAt: new Date().toISOString(),
    ...(primaryProductRef ? { primaryProductRef } : {}),
    assets: accepted,
    rejected,
  };
}

export async function collectWorkspaceMaterialLibrary(directory: string) {
  const managed = await collectMaterialLibraryFromDirectory(
    workspaceMaterialsPath(directory),
  );
  if (managed.assets.length > 0 || managed.rejected.length > 0) {
    return managed;
  }

  return collectMaterialLibraryFromDirectory(directory);
}

export async function collectWorkspaceMaterialLibraryForWorkspace(
  workspaceId: string,
) {
  const adapter = await getWorkspaceStorageAdapter(workspaceId);
  if (adapter.kind === "LOCAL" && adapter.binding.localPath) {
    return collectWorkspaceMaterialLibrary(adapter.binding.localPath);
  }
  return collectMaterialLibraryFromStorage(adapter);
}

export async function productBriefImageInputForWorkspace(
  workspaceId: string,
  material: MaterialIntakeArtifact,
) {
  const primaryImage =
    material.assets.find(
      (asset) =>
        asset.ref === material.primaryProductRef && asset.kind === "image",
    ) ??
    material.assets.find((asset) => asset.kind === "image" && asset.included);
  if (!primaryImage) {
    return undefined;
  }

  const adapter = await getWorkspaceStorageAdapter(workspaceId);
  const bytes = await adapter.readObject(`materials/${primaryImage.ref}`);
  assertImageDimensionsWithinPolicy(
    bytes,
    primaryImage.mime,
    undefined,
    primaryImage.ref,
  );
  return {
    url: `data:${primaryImage.mime};base64,${bytes.toString("base64")}`,
    mode: "data_url" as const,
    detail: "high" as const,
  };
}

export async function materialImagesForWorkspace(
  workspaceId: string,
  material: MaterialIntakeArtifact,
) {
  const imageAssets = material.assets.filter(
    (asset) => asset.kind === "image" && asset.included,
  );
  const adapter = await getWorkspaceStorageAdapter(workspaceId);
  return Promise.all(
    imageAssets.map(async (asset) => {
      const bytes = await adapter.readObject(`materials/${asset.ref}`);
      assertImageDimensionsWithinPolicy(bytes, asset.mime, undefined, asset.ref);
      return {
        ref: asset.ref,
        url: `data:${asset.mime};base64,${bytes.toString("base64")}`,
        mode: "data_url" as const,
        detail: "high" as const,
      };
    }),
  );
}

export async function materialVideosForWorkspace(
  workspaceId: string,
  material: MaterialIntakeArtifact,
) {
  const videoAssets = material.assets.filter(
    (asset) => asset.kind === "video" && asset.included,
  );
  const adapter = await getWorkspaceStorageAdapter(workspaceId);
  return Promise.all(
    videoAssets.map(async (asset) => {
      const bytes = await adapter.readObject(`materials/${asset.ref}`);
      return {
        ref: asset.ref,
        url: `data:${asset.mime};base64,${bytes.toString("base64")}`,
        mode: "data_url" as const,
        fps: 0.5,
      };
    }),
  );
}

export async function materialIntakeTextPreviewsForWorkspace(
  workspaceId: string,
  material: MaterialIntakeArtifact,
) {
  const textAssets = material.assets.filter(
    (asset) => asset.kind === "text" && asset.included,
  );
  const adapter = await getWorkspaceStorageAdapter(workspaceId);
  return Promise.all(
    textAssets.map(async (asset) => ({
      ref: asset.ref,
      text: (await adapter.readObject(`materials/${asset.ref}`))
        .toString("utf8")
        .slice(0, 4000),
    })),
  );
}
