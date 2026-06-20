import { mkdir } from "node:fs/promises";
import {
  createS3Client,
  ensureBucket,
  loadS3CompatibleConfig,
} from "@aigc-video/storage";
import { config } from "../../common/config.js";
import { HttpError } from "../../common/errors.js";
import { db, type WorkspaceStorageBindingRow } from "../../db/client.js";
import { workspaceRepository } from "./workspace.repository.js";
import type { WorkspaceDirectoryRequest } from "./workspace.schema.js";
import {
  normalizeWorkspacePath,
  readManifest,
  toManifest,
  writeManifest,
} from "./workspace-manifest.service.js";

export function storageBindingView(binding: WorkspaceStorageBindingRow | null) {
  if (!binding) {
    return { bound: false };
  }
  return {
    bound: true,
    id: binding.id,
    kind: binding.kind === "LOCAL" ? "local" : "s3",
    localPath: binding.localPath,
    s3:
      binding.kind === "S3"
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

export async function bindDefaultS3Storage(workspaceId: string) {
  const s3Config = loadS3CompatibleConfig();
  const client = createS3Client(s3Config);
  await ensureBucket({
    client,
    bucket: s3Config.bucket,
    region: s3Config.region,
  });
  return workspaceRepository.bindS3Storage({
    workspaceId,
    bucket: s3Config.bucket,
    prefix: `workspaces/${workspaceId}`,
    region: s3Config.region,
    endpoint: s3Config.endpoint,
  });
}

export async function resolveWorkspaceLocalPath(
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

export const workspaceStorageBindingService = {
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

  async bindDefaultStorageForWorkspace(workspaceId: string) {
    if (config.workspaceStorageKind !== "s3") {
      return null;
    }
    return bindDefaultS3Storage(workspaceId);
  },
};
