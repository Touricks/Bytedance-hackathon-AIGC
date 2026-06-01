import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { PoolClient } from "pg";
import { createFileTraceLogger } from "@aigc-video/ai";
import {
  productBriefArtifactSchema,
  storyboardArtifactSchema,
  type MaterialAsset,
  type MaterialIntakeArtifact,
  type ProductBriefArtifact,
  type StoryboardArtifact,
  type CreativeWorkspace,
} from "@aigc-video/shared";
import {
  assertImageDimensionsWithinPolicy,
  assertValidRasterImageBytes,
} from "../../common/image-validation.js";
import { config } from "../../common/config.js";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import type { WorkspaceStorageBindingRow } from "../../db/client.js";
import {
  workspaceManifestSchema,
  type WorkspaceDirectoryRequest,
  type WorkspaceManifest,
} from "./workspace.schema.js";
import {
  chooseInitWorkspaceId,
  filterUnregisteredDiscovered,
  type DiscoveredWorkspace,
} from "./workspace.discovery.js";

const workspaceManifestRelativePath = path.join(".daireel", "workspace.json");
const workspaceTraceFile = ".daireel/trace/events.jsonl" as const;
const workspaceMaterialsRelativePath = path.join(".daireel", "materials");
const workspaceReviewRelativePath = path.join(".daireel", "review");
export const maxWorkspaceMaterialBytes = 50 * 1024 * 1024;

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

function normalizeWorkspacePath(directory: string) {
  return path.resolve(directory);
}

function storageBindingView(binding: WorkspaceStorageBindingRow | null) {
  if (!binding) {
    return { bound: false };
  }
  return {
    bound: true,
    id: binding.id,
    kind: binding.kind === "LOCAL" ? "local" : "s3",
    localPath: binding.localPath,
    s3: binding.kind === "S3"
      ? {
          bucket: binding.s3Bucket,
          prefix: binding.s3Prefix,
          region: binding.s3Region,
          endpoint: binding.s3Endpoint,
        }
      : null,
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt,
  };
}

function workspaceMaterialsPath(directory: string) {
  return path.join(directory, workspaceMaterialsRelativePath);
}

function isInsideDirectory(filePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, filePath);
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isWorkspaceVisibleInConfiguredRoots(localPath: string) {
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

function managedWorkspaceName(input?: string) {
  const normalized =
    input
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace";
  return normalized || "workspace";
}

function safeWorkspaceFilename(filename: string) {
  const baseName = path.basename(filename);
  if (baseName !== filename || baseName === "." || baseName === "..") {
    throw new Error("Workspace material filename must not include a path");
  }
  if (baseName.startsWith(".")) {
    throw new Error("Workspace material filename must not be hidden");
  }
  return baseName;
}

function workspaceMaterialMime(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  const mime = mimeByExtension[ext];
  if (!mime) {
    throw new Error("Unsupported material type");
  }
  return mime;
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

function manifestPath(directory: string) {
  return path.join(directory, workspaceManifestRelativePath);
}

function toManifest(input: {
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

async function writeManifest(directory: string, manifest: WorkspaceManifest) {
  await mkdir(path.dirname(manifestPath(directory)), { recursive: true });
  await writeFile(
    manifestPath(directory),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export async function writeReviewSnapshot(input: {
  localPath: string;
  workspace: CreativeWorkspace;
  artifact: "product-brief" | "storyboard";
  status: "proposed" | "approved";
  schemaVersion: string;
  data: ProductBriefArtifact | StoryboardArtifact;
}) {
  const reviewPath = path.join(
    input.localPath,
    workspaceReviewRelativePath,
    `${input.artifact}.${input.status}.json`,
  );
  await mkdir(path.dirname(reviewPath), { recursive: true });
  await writeFile(
    reviewPath,
    `${JSON.stringify(
      {
        artifact: input.artifact,
        status: input.status,
        schemaVersion: input.schemaVersion,
        workspaceId: input.workspace.id,
        scriptId: input.workspace.currentScriptId,
        writtenAt: new Date().toISOString(),
        data: input.data,
      },
      null,
      2,
    )}\n`,
  );
}

async function readManifest(directory: string) {
  const raw = await readFile(manifestPath(directory), "utf8");
  return workspaceManifestSchema.parse(JSON.parse(raw));
}

async function readManifestSafe(
  directory: string,
): Promise<WorkspaceManifest | null> {
  try {
    return await readManifest(directory);
  } catch {
    return null;
  }
}

async function workspaceIdInUse(workspaceId: string): Promise<boolean> {
  try {
    await db.getWorkspace(workspaceId);
    return true;
  } catch {
    return false;
  }
}

const discoveryIgnoredDirs = new Set([
  "node_modules",
  ".git",
  ".daireel",
  ".turbo",
  "dist",
  "coverage",
]);

/**
 * Scan each configured root (bounded depth) for directories that contain a
 * `.daireel/workspace.json` manifest. A directory holding a manifest is treated
 * as a workspace and is not descended into.
 */
async function scanForWorkspaceManifests(
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

async function resolveWorkspaceLocalPath(
  target: string | WorkspaceDirectoryRequest,
) {
  if (typeof target === "string") {
    return normalizeWorkspacePath(target);
  }

  if (target.workspaceId) {
    const workspace = await db.getWorkspace(target.workspaceId);
    const binding = await db.getActiveWorkspaceStorage(workspace.id);
    if (!binding) {
      throw new HttpError(
        409,
        "STORAGE_NOT_BOUND",
        "Workspace storage is not bound",
      );
    }
    if (binding.kind !== "LOCAL" || !binding.localPath) {
      throw new HttpError(
        409,
        "STORAGE_NOT_LOCAL",
        "Only local workspace storage is supported for this operation",
      );
    }
    const localPath = normalizeWorkspacePath(binding.localPath);
    const manifest = await readManifest(localPath);
    if (manifest.workspaceId !== workspace.id) {
      throw new Error(
        "Workspace manifest does not match requested workspaceId",
      );
    }
    if (manifest.currentScriptId !== workspace.currentScriptId) {
      throw new Error("Workspace manifest does not match requested scriptId");
    }
    return localPath;
  }

  if (target.directory) {
    return normalizeWorkspacePath(target.directory);
  }

  throw new Error("workspaceId or directory is required");
}

export async function resolveWorkspaceStorageLocalPath(workspaceId: string) {
  return resolveWorkspaceLocalPath({ workspaceId });
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function classifyKind(mime: string): MaterialAsset["kind"] {
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  return "text";
}

function assetTypeForMaterialKind(kind: MaterialAsset["kind"]) {
  if (kind === "image") {
    return "product_image" as const;
  }
  if (kind === "video") {
    return "generated_clip" as const;
  }
  return "subtitle" as const;
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

function firstSellingPoint(input: string) {
  return (
    input
      .split(/[,\n，]/)
      .map((value) => value.trim())
      .find(Boolean) ?? input.trim()
  );
}

function inferProductName(input: {
  title?: string;
  userDirection?: string;
  material: MaterialIntakeArtifact;
}) {
  return (
    input.title?.trim() ||
    input.material.assets.find(
      (asset) => asset.ref === input.material.primaryProductRef,
    )?.description ||
    input.userDirection?.trim().slice(0, 48) ||
    "Imported product"
  );
}

function inferSellingPoint(input: {
  sellingPoints?: string;
  userDirection?: string;
  material: MaterialIntakeArtifact;
}) {
  return (
    firstSellingPoint(input.sellingPoints ?? "") ||
    input.material.assets.find((asset) => asset.included)?.description ||
    input.userDirection?.trim() ||
    "Product benefit inferred from selected materials"
  );
}

export function toProductBrief(input: {
  userDirection?: string;
  title?: string;
  sellingPoints?: string;
  audience?: string;
  stylePreference?: string;
  material: MaterialIntakeArtifact;
}): ProductBriefArtifact {
  const sellingPoint = inferSellingPoint(input);
  const productName = inferProductName(input);
  const audience = input.audience?.trim() || "target ecommerce shoppers";
  const productAssets = input.material.assets
    .filter((asset) => asset.included && asset.kind === "image")
    .map((asset) => ({
      ref: asset.ref,
      useAs:
        asset.ref === input.material.primaryProductRef ? "primary" : "support",
    }));

  return productBriefArtifactSchema.parse({
    product: {
      name: productName,
      category: "consumer product",
      keyFacts: (input.sellingPoints ?? sellingPoint)
        .split(/[,\n，]/)
        .map((value) => value.trim())
        .filter(Boolean),
      assets: productAssets,
    },
    audience: {
      who: audience,
      painOrDesire: `Needs ${sellingPoint}`,
    },
    coreSellingPoint: sellingPoint,
    proof: input.material.assets
      .filter((asset) => asset.included)
      .map((asset) => asset.description),
    offer: null,
    platform: "Seedance",
    brandTone: input.stylePreference ?? "clear ecommerce",
    bannedExpressions: [],
    landingInfo: null,
    assumptions: ["Generated from approved material intake."],
  });
}

function primaryBriefAsset(brief: ProductBriefArtifact) {
  return (
    brief.product.assets.find((asset) => asset.useAs === "primary")?.ref ??
    brief.product.assets[0]?.ref ??
    "product"
  );
}

export function toStoryboard(brief: ProductBriefArtifact): StoryboardArtifact {
  const productAssetRef = primaryBriefAsset(brief);
  const proof = brief.proof[0] ?? brief.coreSellingPoint;

  return storyboardArtifactSchema.parse({
    narrative: `${brief.product.name} helps ${brief.audience.who} with ${brief.coreSellingPoint}.`,
    totalDurationSec: 12,
    shots: [
      {
        index: 0,
        purpose: "hook",
        durationSec: 3,
        scene: `${brief.product.name} hero problem hook`,
        visualDirection: `Show ${productAssetRef} as the primary product asset with ${brief.brandTone} styling.`,
        productAssetRef,
        voiceover: `Meet ${brief.product.name}.`,
        transition: "cut",
      },
      {
        index: 1,
        purpose: "benefit",
        durationSec: 3,
        scene: `${brief.coreSellingPoint} benefit demonstration`,
        visualDirection: `Use ${productAssetRef} in a realistic moment for ${brief.audience.who}.`,
        productAssetRef,
        voiceover: `${brief.coreSellingPoint}.`,
        transition: "match cut",
      },
      {
        index: 2,
        purpose: "proof",
        durationSec: 3,
        scene: "Proof and product detail",
        visualDirection: `Show a close detail of ${productAssetRef} that supports: ${proof}.`,
        productAssetRef,
        voiceover: proof,
        transition: "push",
      },
      {
        index: 3,
        purpose: "cta",
        durationSec: 3,
        scene: "Clear purchase call to action",
        visualDirection: `End on ${productAssetRef} with a confident ecommerce packshot.`,
        productAssetRef,
        voiceover: `Try ${brief.product.name} today.`,
        transition: "fade",
      },
    ],
    assumptions: ["Storyboard generated from approved product brief."],
  });
}

export function createWorkspaceTraceLogger(
  localPath: string,
  workspace: CreativeWorkspace,
) {
  return createFileTraceLogger({
    traceId: workspace.currentScriptId,
    workspaceId: workspace.id,
    traceFilePath: path.join(localPath, workspaceTraceFile),
  });
}

export async function productBriefImageInput(
  localPath: string,
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

  const bytes = await readFile(
    path.join(workspaceMaterialsPath(localPath), primaryImage.ref),
  );
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

export async function materialIntakeImageInputs(
  localPath: string,
  material: MaterialIntakeArtifact,
) {
  const imageAssets = material.assets.filter(
    (asset) => asset.kind === "image" && asset.included,
  );

  return Promise.all(
    imageAssets.map(async (asset) => {
      const bytes = await readFile(
        path.join(workspaceMaterialsPath(localPath), asset.ref),
      );
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

export async function materialIntakeTextPreviews(
  localPath: string,
  material: MaterialIntakeArtifact,
) {
  const textAssets = material.assets.filter(
    (asset) => asset.kind === "text" && asset.included,
  );

  return Promise.all(
    textAssets.map(async (asset) => ({
      ref: asset.ref,
      text: (
        await readFile(
          path.join(workspaceMaterialsPath(localPath), asset.ref),
          "utf8",
        )
      ).slice(0, 4000),
    })),
  );
}

function workspaceAssetUrl(workspaceId: string, ref: string) {
  return `/api/workspaces/${workspaceId}/materials/${encodeURIComponent(ref)}`;
}

function workspaceMaterialMetadata(input: {
  workspaceId: string;
  ref: string;
  storagePath: string;
  mime: string;
  bytes: number;
  digest: string;
}) {
  return {
    workspaceId: input.workspaceId,
    ref: input.ref,
    storagePath: input.storagePath,
    contentType: input.mime,
    mimeType: input.mime,
    sizeBytes: input.bytes,
    sha256: input.digest,
  };
}

async function ensureWorkspaceMaterialAsset(input: {
  client: PoolClient;
  workspaceId: string;
  localPath: string;
  ref: string;
}) {
  const url = workspaceAssetUrl(input.workspaceId, input.ref);
  const existing = await input.client.query(
    `select id
     from asset
     where source = 'upload'
       and (
         (metadata->>'workspaceId' = $1 and metadata->>'ref' = $2)
         or url = $3
       )
     order by created_at desc
     limit 1`,
    [input.workspaceId, input.ref, url],
  );
  if (existing.rows[0]?.id) {
    return String(existing.rows[0].id);
  }

  const filename = safeWorkspaceFilename(input.ref);
  const mime = workspaceMaterialMime(filename);
  const storagePath = path.join(workspaceMaterialsPath(input.localPath), filename);
  const fileStats = await stat(storagePath);
  const bytes = await readFile(storagePath);
  const kind = classifyKind(mime);
  const assetId = nanoid();
  await input.client.query(
    `insert into asset (id, type, url, source, metadata)
     values ($1, $2, $3, 'upload', $4)`,
    [
      assetId,
      assetTypeForMaterialKind(kind),
      url,
      JSON.stringify(
        workspaceMaterialMetadata({
          workspaceId: input.workspaceId,
          ref: filename,
          storagePath,
          mime,
          bytes: fileStats.size,
          digest: sha256(bytes),
        }),
      ),
    ],
  );
  return assetId;
}

async function refreshWorkspaceForCurrentJob(workspace: CreativeWorkspace) {
  if (!workspace.currentJobId || workspace.status !== "video_generating") {
    return workspace;
  }

  const job = await db.getJob(workspace.currentJobId);
  if (job.status === "completed") {
    return db.updateWorkspace(workspace.id, { status: "video_ready" });
  }
  if (job.status === "failed") {
    return db.updateWorkspace(workspace.id, { status: "failed" });
  }

  return workspace;
}

export function runtimeMode() {
  return process.env.MODEL_MODE === "real" ? "real" : "mock";
}

export function promptViewProvider(): "ark" | "deterministic" {
  return runtimeMode() === "real" ? "ark" : "deterministic";
}

export function promptViewModel() {
  return runtimeMode() === "real"
    ? process.env.TEXT_ENDPOINT_ID ?? process.env.AI_TEXT_ENDPOINT_ID ?? process.env.ARK_TEXT_ENDPOINT_ID
    : undefined;
}

function runtimeBuilderNextAction(input: {
  stage: string;
  endpoint: string;
  runtimeBuilder: string;
}) {
  const mode = runtimeMode();
  return {
    stage: input.stage,
    endpoint: input.endpoint,
    method: "POST",
    actionType: "runtime_builder",
    runtimeBuilder: input.runtimeBuilder,
    runtimeMode: mode,
    requiresHumanApproval: false,
    willCallProvider: mode === "real",
    provider: mode === "real" ? "ark" : undefined,
    requiresProviderConfig: mode === "real",
  };
}

function humanApprovalNextAction(input: { stage: string; endpoint: string }) {
  return {
    stage: input.stage,
    endpoint: input.endpoint,
    method: "POST",
    actionType: "human_approval",
    runtimeMode: runtimeMode(),
    requiresHumanApproval: true,
    willCallProvider: false,
    requiresProviderConfig: false,
  };
}

function nextActionFor(workspace: CreativeWorkspace) {
  switch (workspace.status) {
    case "draft":
      return runtimeBuilderNextAction({
        stage: "materials",
        endpoint: "/api/workspaces/{workspaceId}/material-intake/propose",
        runtimeBuilder: "material_intake",
      });
    case "materials_ready":
      return runtimeBuilderNextAction({
        stage: "brief",
        endpoint: "/api/workspaces/{workspaceId}/product-brief/propose",
        runtimeBuilder: "product_brief",
      });
    case "brief_proposed":
      return humanApprovalNextAction({
        stage: "brief",
        endpoint: "/api/workspaces/{workspaceId}/product-brief/approve",
      });
    case "brief_approved":
      return runtimeBuilderNextAction({
        stage: "storyboard",
        endpoint: "/api/workspaces/{workspaceId}/storyboard/propose",
        runtimeBuilder: "storyboard",
      });
    case "storyboard_proposed":
      return humanApprovalNextAction({
        stage: "storyboard",
        endpoint: "/api/workspaces/{workspaceId}/storyboard/approve",
      });
    case "storyboard_approved":
      return runtimeBuilderNextAction({
        stage: "shotprompt",
        endpoint: "/api/workspaces/{workspaceId}/shotprompt/propose",
        runtimeBuilder: "shotprompt",
      });
    case "shotprompt_proposed":
      return humanApprovalNextAction({
        stage: "shotprompt",
        endpoint: "/api/workspaces/{workspaceId}/shotprompt/approve",
      });
    case "shotprompt_approved":
      return {
        stage: "video",
        endpoint: "/api/workspaces/{workspaceId}/shot-sets",
        method: "POST",
        actionType: "shot_set_apply",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: runtimeMode() === "real",
        provider: runtimeMode() === "real" ? "seedance" : undefined,
        requiresProviderConfig: runtimeMode() === "real",
      };
    case "video_generating":
      return {
        stage: "video",
        endpoint: `/api/jobs/${workspace.currentJobId ?? ""}`,
        method: "GET",
        actionType: "status_poll",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
    case "video_ready":
      return {
        stage: "feedback",
        endpoint: "/api/workspaces/{workspaceId}/final-videos",
        method: "POST",
        actionType: "final_compose",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
    case "failed":
      return {
        stage: "recovery",
        endpoint: "/api/workspaces/{workspaceId}/status",
        method: "POST",
        actionType: "recovery",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: true,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
    case "missing":
      return {
        stage: "recovery",
        endpoint: "/api/workspaces/init",
        method: "POST",
        actionType: "recovery",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
  }
}

export function applySelectedMaterialRefs(
  materialLibrary: Awaited<ReturnType<typeof collectWorkspaceMaterialLibrary>>,
  selectedMaterialRefs?: string[],
) {
  if (!selectedMaterialRefs?.length) {
    return materialLibrary;
  }

  const selected = new Set(selectedMaterialRefs);
  const acceptedRefs = new Set(
    materialLibrary.assets.map((asset) => asset.ref),
  );
  const invalidRefs = selectedMaterialRefs.filter(
    (ref) => !acceptedRefs.has(ref),
  );
  if (invalidRefs.length > 0) {
    throw new Error(
      `Invalid selected material refs: ${invalidRefs.join(", ")}`,
    );
  }

  const assets = materialLibrary.assets.filter((asset) =>
    selected.has(asset.ref),
  );
  const primaryProductRef =
    assets.find((asset) => asset.ref === materialLibrary.primaryProductRef)
      ?.ref ??
    assets.find((asset) => asset.kind === "image")?.ref ??
    assets[0]?.ref;

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
  if (!input.selectedMaterialRefs?.length) {
    return;
  }

  const materialDirectory = workspaceMaterialsPath(input.directory);
  await mkdir(materialDirectory, { recursive: true });

  for (const ref of input.selectedMaterialRefs) {
    const filename = safeWorkspaceFilename(ref);

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
      // Nothing to import from the bound directory for this ref; any already
      // managed (e.g. uploaded) file of the same name is left untouched.
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
          // Already imported: keep the copy idempotent.
          continue;
        }
      }
      // A stale or differing file (e.g. an old placeholder) is squatting the
      // managed name. The user explicitly selected the bound-directory file,
      // so that selection must win — overwrite the squatter.
    }

    await copyFile(source, destination);
  }
}

async function collectMaterialLibraryFromDirectory(materialDirectory: string) {
  let entries;
  try {
    entries = await readdir(materialDirectory, { withFileTypes: true });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        scannedAt: new Date().toISOString(),
        assets: [],
        rejected: [],
      };
    }
    throw error;
  }
  const accepted: MaterialAsset[] = [];
  const rejected: Array<{ ref: string; reason: string }> = [];
  let hasPrimaryImage = false;

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || !entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    const mime = mimeByExtension[ext];
    if (!mime) {
      rejected.push({ ref: entry.name, reason: "Unsupported material type" });
      continue;
    }

    const filePath = path.join(materialDirectory, entry.name);
    const fileStats = await stat(filePath);
    if (fileStats.size > maxWorkspaceMaterialBytes) {
      rejected.push({
        ref: entry.name,
        reason: "Material file exceeds 50MB limit",
      });
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
          reason:
            error instanceof Error ? error.message : "Invalid image material",
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

export async function collectWorkspaceMaterialLibrary(directory: string) {
  const managed = await collectMaterialLibraryFromDirectory(
    workspaceMaterialsPath(directory),
  );
  if (managed.assets.length > 0 || managed.rejected.length > 0) {
    return managed;
  }

  return collectMaterialLibraryFromDirectory(directory);
}

const workspaceModuleTables = [
  {
    moduleId: "prompt-requirements",
    table: "prompt_requirements_artifacts",
  },
  { moduleId: "material-intake", table: "material_intake_artifacts" },
  { moduleId: "product-brief", table: "product_brief_artifacts" },
  { moduleId: "storyboard", table: "storyboard_artifacts" },
  { moduleId: "shotprompt", table: "shot_prompt_artifacts" },
] as const;

type WorkspaceModuleId = (typeof workspaceModuleTables)[number]["moduleId"];

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function moduleArtifactView(
  row: Record<string, unknown>,
  moduleId: WorkspaceModuleId,
) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    moduleId,
    type: moduleId,
    status: String(row.status),
    isCurrent: Boolean(row.is_current),
    data: row.data,
    sourceFingerprint:
      row.source_fingerprint && typeof row.source_fingerprint === "object"
        ? row.source_fingerprint
        : {},
    promptAssembly:
      row.prompt_assembly && typeof row.prompt_assembly === "object"
        ? row.prompt_assembly
        : {},
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : null,
  };
}

async function hydrateWorkspaceModuleState(
  workspaceId: string,
  module: (typeof workspaceModuleTables)[number],
) {
  const [proposedResult, currentResult] = await Promise.all([
    db.db2.pool().query(
      `select *
       from ${module.table}
       where workspace_id = $1 and status = 'proposed'
       order by created_at desc, id desc
       limit 1`,
      [workspaceId],
    ),
    db.db2.pool().query(
      `select *
       from ${module.table}
       where workspace_id = $1
         and status = 'approved'
         and is_current = true
       order by approved_at desc, created_at desc, id desc
       limit 1`,
      [workspaceId],
    ),
  ]);
  const proposed = proposedResult.rows[0]
    ? moduleArtifactView(proposedResult.rows[0], module.moduleId)
    : null;
  const current = currentResult.rows[0]
    ? moduleArtifactView(currentResult.rows[0], module.moduleId)
    : null;

  return {
    moduleId: module.moduleId,
    proposed,
    current,
    upstream: {
      upstreamChanged: false,
      changedSources: [],
    },
  };
}

async function hydrateWorkspaceModules(workspaceId: string) {
  const entries = await Promise.all(
    workspaceModuleTables.map(async (module) => [
      module.moduleId,
      await hydrateWorkspaceModuleState(workspaceId, module),
    ]),
  );
  return Object.fromEntries(entries) as Record<
    WorkspaceModuleId,
    Awaited<ReturnType<typeof hydrateWorkspaceModuleState>>
  >;
}

function hydrateWorkspaceArtifacts(
  modules: Awaited<ReturnType<typeof hydrateWorkspaceModules>>,
) {
  return {
    promptRequirements:
      modules["prompt-requirements"].current ??
      modules["prompt-requirements"].proposed,
    material:
      modules["material-intake"].current ?? modules["material-intake"].proposed,
    brief:
      modules["product-brief"].current ?? modules["product-brief"].proposed,
    storyboard: modules.storyboard.current ?? modules.storyboard.proposed,
    shotPrompt: modules.shotprompt.current ?? modules.shotprompt.proposed,
  };
}

function shotSetView(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotPromptArtifactId: String(row.shot_prompt_artifact_id),
    status: String(row.status),
    sourceFingerprint:
      row.source_fingerprint && typeof row.source_fingerprint === "object"
        ? row.source_fingerprint
        : {},
    createdAt: toIsoString(row.created_at),
    archivedAt: row.archived_at ? toIsoString(row.archived_at) : null,
  };
}

async function getActiveWorkspaceShotSet(workspaceId: string) {
  const result = await db.db2.pool().query(
    `select *
     from shot_sets
     where workspace_id = $1 and status = 'active'
     order by created_at desc, id desc
     limit 1`,
    [workspaceId],
  );
  return result.rows[0] ? shotSetView(result.rows[0]) : null;
}

export const workspaceService = {
  async createManagedWorkspace(name?: string) {
    const workspace = await db.createWorkspace({
      id: nanoid(),
      localPath: null,
      currentScriptId: nanoid(),
      status: "draft",
      traceFile: workspaceTraceFile,
    });
    return {
      workspace,
      manifest: toManifest({
        workspaceId: workspace.id,
        currentScriptId: workspace.currentScriptId,
        currentJobId: workspace.currentJobId,
      }),
      storage: storageBindingView(null),
      ...(name ? { name: name.trim() } : {}),
    };
  },

  async listManagedWorkspaces() {
    const workspaces = (await db.listWorkspaces()).filter((workspace) =>
      isWorkspaceVisibleInConfiguredRoots(workspace.localPath),
    );
    const withStorage = await Promise.all(
      workspaces.map(async (workspace) => ({
        ...workspace,
        storage: storageBindingView(
          await db.getActiveWorkspaceStorage(workspace.id),
        ),
      })),
    );
    const dbPaths = workspaces.map((workspace) =>
      normalizeWorkspacePath(workspace.localPath),
    );
    const scanned = await scanForWorkspaceManifests(
      config.workspaceDiscoveryRoots,
      3,
    );
    const discovered = filterUnregisteredDiscovered(dbPaths, scanned);
    return { workspaces: withStorage, discovered };
  },

  async getWorkspaceDirectory(workspaceId: string) {
    const workspace = await db.getWorkspace(workspaceId);
    const localPath = await resolveWorkspaceStorageLocalPath(workspace.id);
    return {
      data: {
        workspaceId: workspace.id,
        directory: localPath,
      },
    };
  },

  async getWorkspaceStorage(workspaceId: string) {
    await db.getWorkspace(workspaceId);
    return {
      data: {
        workspaceId,
        storage: storageBindingView(
          await db.getActiveWorkspaceStorage(workspaceId),
        ),
      },
    };
  },

  async bindWorkspaceStorage(
    workspaceId: string,
    input:
      | { kind: "local"; localPath: string }
      | {
          kind: "s3";
          bucket: string;
          prefix: string;
          region?: string;
          endpoint?: string;
        },
  ) {
    const workspace = await db.getWorkspace(workspaceId);
    try {
      const binding =
        input.kind === "local"
          ? await db.bindWorkspaceLocalStorage({
              workspaceId: workspace.id,
              localPath: normalizeWorkspacePath(input.localPath),
              localPathNormalized: normalizeWorkspacePath(input.localPath),
            })
          : await db.bindWorkspaceS3Storage({
              workspaceId: workspace.id,
              bucket: input.bucket,
              prefix: input.prefix,
              region: input.region,
              endpoint: input.endpoint,
            });
      if (binding.kind === "LOCAL" && binding.localPath) {
        await mkdir(binding.localPath, { recursive: true });
        await writeManifest(
          binding.localPath,
          toManifest({
            workspaceId: workspace.id,
            currentScriptId: workspace.currentScriptId,
            currentJobId: workspace.currentJobId,
          }),
        );
      }
      return {
        data: {
          workspaceId: workspace.id,
          storage: storageBindingView(binding),
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "WORKSPACE_STORAGE_ALREADY_BOUND") {
          throw new HttpError(409, error.message, error.message);
        }
        if (error.message === "STORAGE_ALREADY_BOUND") {
          throw new HttpError(409, error.message, error.message);
        }
      }
      throw error;
    }
  },

  async initialize(directory: string) {
    const localPath = normalizeWorkspacePath(directory);
    const existing = await db.findWorkspaceByLocalPath(localPath);
    let workspace = existing;
    if (!workspace) {
      // No DB row for this directory. If an on-disk manifest survives (e.g. the
      // DB was reset but `.daireel/` was kept), reconnect the original
      // workspace id instead of orphaning the draft under a fresh id.
      const manifest = await readManifestSafe(localPath);
      const reuseId = chooseInitWorkspaceId({
        manifestWorkspaceId: manifest?.workspaceId,
        manifestIdInUse: manifest?.workspaceId
          ? await workspaceIdInUse(manifest.workspaceId)
          : false,
      });
      workspace = await db.createWorkspace({
        id: reuseId ?? nanoid(),
        localPath,
        currentScriptId: manifest?.currentScriptId ?? nanoid(),
        status: "draft",
        traceFile: workspaceTraceFile,
      });
    }
    const touched = existing ? await db.touchWorkspace(existing.id) : workspace;
    await db.bindWorkspaceLocalStorage({
      workspaceId: touched.id,
      localPath,
      localPathNormalized: localPath,
    });
    const manifest = toManifest({
      workspaceId: touched.id,
      currentScriptId: touched.currentScriptId,
      currentJobId: touched.currentJobId,
    });
    await writeManifest(localPath, manifest);

    return {
      workspace: await db.getWorkspace(touched.id),
      manifest,
      storage: storageBindingView(await db.getActiveWorkspaceStorage(touched.id)),
    };
  },

  async uploadMaterial(input: {
    workspaceId: string;
    filename: string;
    bytes: Uint8Array;
  }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    const localPath = await resolveWorkspaceStorageLocalPath(workspace.id);
    const requestedFilename = safeWorkspaceFilename(input.filename);
    const requestedMime = workspaceMaterialMime(requestedFilename);
    if (input.bytes.byteLength > maxWorkspaceMaterialBytes) {
      throw new Error("Material file exceeds 50MB limit");
    }
    const bytes = Buffer.from(input.bytes);

    const materialDirectory = workspaceMaterialsPath(localPath);
    await mkdir(materialDirectory, { recursive: true });
    const filename = requestedFilename;
    const storagePath = path.join(materialDirectory, filename);
    await writeFile(storagePath, bytes);
    const mime = requestedMime;
    const digest = sha256(bytes);
    const kind = classifyKind(mime);
    const asset = await db.createAsset({
      type: assetTypeForMaterialKind(kind),
      url: workspaceAssetUrl(workspace.id, filename),
      source: "upload",
      metadata: workspaceMaterialMetadata({
        workspaceId: workspace.id,
        ref: filename,
        storagePath,
        mime,
        bytes: bytes.byteLength,
        digest,
      }),
    });
    const touched = await db.touchWorkspace(workspace.id);

    return {
      workspace: touched,
      material: {
        assetId: asset.id,
        ref: filename,
        bytes: bytes.byteLength,
        mime,
        sha256: digest,
        url: workspaceAssetUrl(workspace.id, filename),
      },
    };
  },

  async status(target: string | WorkspaceDirectoryRequest) {
    if (typeof target !== "string" && target.workspaceId && !target.directory) {
      const workspace = await refreshWorkspaceForCurrentJob(
        await db.touchWorkspace(target.workspaceId),
      );
      const binding = await db.getActiveWorkspaceStorage(workspace.id);
      if (!binding) {
        const [modules, activeShotSet] = await Promise.all([
          hydrateWorkspaceModules(workspace.id),
          getActiveWorkspaceShotSet(workspace.id),
        ]);
        return {
          workspace,
          manifest: toManifest({
            workspaceId: workspace.id,
            currentScriptId: workspace.currentScriptId,
            currentJobId: workspace.currentJobId,
          }),
          storage: storageBindingView(null),
          nextAction: "BIND_STORAGE",
          materialLibrary: {
            scannedAt: new Date().toISOString(),
            assets: [],
            rejected: [],
          },
          modules,
          activeShotSet,
          artifacts: hydrateWorkspaceArtifacts(modules),
        };
      }
    }
    const localPath = await resolveWorkspaceLocalPath(target);
    const manifest = await readManifest(localPath);
    const touched = await db.touchWorkspace(manifest.workspaceId);
    const workspace = await refreshWorkspaceForCurrentJob(touched);
    const binding = await db.getActiveWorkspaceStorage(workspace.id);
    const current = toManifest({
      workspaceId: workspace.id,
      currentScriptId: workspace.currentScriptId,
      currentJobId: workspace.currentJobId,
    });

    if (JSON.stringify(current) !== JSON.stringify(manifest)) {
      await writeManifest(localPath, current);
    }

    const [modules, activeShotSet] = await Promise.all([
      hydrateWorkspaceModules(workspace.id),
      getActiveWorkspaceShotSet(workspace.id),
    ]);

    return {
      workspace,
      manifest: current,
      storage: storageBindingView(binding),
      nextAction: nextActionFor(workspace),
      materialLibrary: await collectWorkspaceMaterialLibrary(localPath),
      modules,
      activeShotSet,
      artifacts: hydrateWorkspaceArtifacts(modules),
    };
  },
};
