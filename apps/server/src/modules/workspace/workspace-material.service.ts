import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { PoolClient } from "pg";
import type { MaterialAsset } from "@aigc-video/shared";
import { HttpError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { getWorkspaceStorageAdapter } from "./storage/workspace-storage-resolver.js";
import { joinObjectKey } from "./storage/workspace-storage.keys.js";
import {
  classifyKind,
  maxModelImageMaterialBytes,
  maxWorkspaceMaterialBytes,
  normalizeMaterialFilename,
  sha256,
  workspaceMaterialMime,
  workspaceMaterialsPath,
} from "./workspace-material-library.service.js";

function assetTypeForMaterialKind(kind: MaterialAsset["kind"]) {
  if (kind === "image") {
    return "product_image" as const;
  }
  if (kind === "video") {
    return "generated_clip" as const;
  }
  return "subtitle" as const;
}

function safeWorkspaceMaterialRef(ref: string) {
  try {
    return normalizeMaterialFilename(ref);
  } catch {
    throw new HttpError(
      400,
      "INVALID_MATERIAL_REF",
      "Workspace material ref must be a filename",
    );
  }
}

export function workspaceAssetUrl(workspaceId: string, ref: string) {
  return `/api/workspaces/${workspaceId}/materials/${encodeURIComponent(ref)}`;
}

export function workspaceMaterialMetadata(input: {
  workspaceId: string;
  ref: string;
  storagePath?: string;
  objectKey?: string;
  mime: string;
  bytes: number;
  digest: string;
}) {
  return {
    workspaceId: input.workspaceId,
    ref: input.ref,
    ...(input.storagePath ? { storagePath: input.storagePath } : {}),
    ...(input.objectKey ? { objectKey: input.objectKey } : {}),
    contentType: input.mime,
    mimeType: input.mime,
    sizeBytes: input.bytes,
    sha256: input.digest,
  };
}

export async function ensureWorkspaceMaterialAsset(input: {
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

  const filename = normalizeMaterialFilename(input.ref);
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

export const workspaceMaterialService = {
  async uploadMaterial(input: {
    workspaceId: string;
    filename: string;
    bytes: Uint8Array;
  }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    const adapter = await getWorkspaceStorageAdapter(workspace.id);
    const requestedFilename = normalizeMaterialFilename(input.filename);
    const requestedMime = workspaceMaterialMime(requestedFilename);
    if (input.bytes.byteLength > maxWorkspaceMaterialBytes) {
      throw new Error("Material file exceeds 50MB limit");
    }
    if (
      requestedMime.startsWith("image/") &&
      input.bytes.byteLength > maxModelImageMaterialBytes
    ) {
      throw new HttpError(
        400,
        "IMAGE_TOO_LARGE_FOR_MODEL",
        "Image material exceeds 10MB model input limit",
      );
    }
    const bytes = Buffer.from(input.bytes);

    const filename = requestedFilename;
    const relativePath = `materials/${filename}`;
    await adapter.putObject({
      relativePath,
      body: bytes,
      contentType: requestedMime,
    });
    const mime = requestedMime;
    const digest = sha256(bytes);
    const kind = classifyKind(mime);
    const objectKey =
      adapter.kind === "S3" && adapter.binding.s3Prefix
        ? joinObjectKey(adapter.binding.s3Prefix, relativePath)
        : relativePath;
    const asset = await db.createAsset({
      type: assetTypeForMaterialKind(kind),
      url: workspaceAssetUrl(workspace.id, filename),
      source: "upload",
      metadata: workspaceMaterialMetadata({
        workspaceId: workspace.id,
        ref: filename,
        ...(adapter.kind === "LOCAL" && adapter.binding.localPath
          ? {
              storagePath: path.join(
                workspaceMaterialsPath(adapter.binding.localPath),
                filename,
              ),
            }
          : {}),
        objectKey,
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

  async deleteMaterial(input: { workspaceId: string; ref: string }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    const adapter = await getWorkspaceStorageAdapter(workspace.id);
    const ref = safeWorkspaceMaterialRef(input.ref);
    const relativePath = `materials/${ref}`;
    if (!(await adapter.exists(relativePath))) {
      throw new HttpError(404, "MATERIAL_NOT_FOUND", "Material not found");
    }

    await adapter.deleteObject(relativePath);

    const url = workspaceAssetUrl(workspace.id, ref);
    const client = await db.db2.pool().connect();
    try {
      await client.query("begin");
      const assetIds = await client.query<{ id: string }>(
        `select id
         from asset
         where source = 'upload'
           and (
             (metadata->>'workspaceId' = $1 and metadata->>'ref' = $2)
             or url = $3
           )`,
        [workspace.id, ref, url],
      );
      const ids = assetIds.rows.map((row) => row.id);
      if (ids.length > 0) {
        await client.query(
          `delete from shot_asset_refs where asset_id = any($1::text[])`,
          [ids],
        );
        await client.query(`delete from asset where id = any($1::text[])`, [
          ids,
        ]);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    await db.touchWorkspace(workspace.id);

    return {
      data: {
        workspaceId: workspace.id,
        ref,
        deleted: true,
      },
    };
  },
};
