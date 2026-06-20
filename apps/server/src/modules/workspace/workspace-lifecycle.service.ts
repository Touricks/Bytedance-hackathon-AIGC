import { nanoid } from "nanoid";
import { config } from "../../common/config.js";
import { HttpError } from "../../common/errors.js";
import { logger } from "../../common/logger.js";
import { db } from "../../db/client.js";
import { getWorkspaceStorageAdapter } from "./storage/workspace-storage-resolver.js";
import {
  chooseInitWorkspaceId,
  filterUnregisteredDiscovered,
} from "./workspace.discovery.js";
import {
  isWorkspaceVisibleInConfiguredRoots,
  normalizeWorkspacePath,
  readManifestSafe,
  scanForWorkspaceManifests,
  toManifest,
  workspaceIdInUse,
  workspaceTraceFile,
  writeManifest,
} from "./workspace-manifest.service.js";
import { workspaceRepository } from "./workspace.repository.js";
import {
  storageBindingView,
  workspaceStorageBindingService,
} from "./workspace-storage-binding.service.js";

function normalizeWorkspaceDisplayName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

export const workspaceLifecycleService = {
  async createManagedWorkspace(name?: string) {
    const displayName = normalizeWorkspaceDisplayName(name);
    const workspace = await workspaceRepository.createWorkspace({
      id: nanoid(),
      displayName,
      localPath: null,
      currentScriptId: nanoid(),
      status: "draft",
      traceFile: workspaceTraceFile,
    });
    const binding =
      await workspaceStorageBindingService.bindDefaultStorageForWorkspace(
        workspace.id,
      );
    return {
      workspace,
      manifest: toManifest({
        workspaceId: workspace.id,
        currentScriptId: workspace.currentScriptId,
        currentJobId: workspace.currentJobId,
      }),
      storage: storageBindingView(binding),
    };
  },

  async listManagedWorkspaces() {
    const withStorage = await Promise.all(
      (await workspaceRepository.listWorkspaces()).map(async (workspace) => {
        const binding = await workspaceRepository.getActiveStorage(workspace.id);
        return {
          ...workspace,
          storage: storageBindingView(binding),
          _binding: binding,
        };
      }),
    );
    const visibleWorkspaces = withStorage.filter((workspace) => {
      if (workspace._binding?.kind === "S3") return true;
      return isWorkspaceVisibleInConfiguredRoots(workspace.localPath);
    });
    const dbPaths = visibleWorkspaces
      .filter((workspace) => workspace._binding?.kind !== "S3")
      .map((workspace) => normalizeWorkspacePath(workspace.localPath));
    const scanned = await scanForWorkspaceManifests(
      config.workspaceDiscoveryRoots,
      3,
    );
    const discovered = filterUnregisteredDiscovered(dbPaths, scanned);
    return {
      workspaces: visibleWorkspaces.map(({ _binding, ...workspace }) => workspace),
      discovered,
    };
  },

  async deleteWorkspace(workspaceId: string) {
    await workspaceRepository.getWorkspace(workspaceId);
    const binding = await workspaceRepository.getActiveStorage(workspaceId);
    if (await workspaceRepository.hasActiveGenerationWork(workspaceId)) {
      throw new HttpError(
        409,
        "WORKSPACE_DELETE_BUSY",
        "Workspace has active generation work",
      );
    }

    const adapter = binding ? await getWorkspaceStorageAdapter(workspaceId) : null;

    await workspaceRepository.deleteWorkspaceCascade(workspaceId);

    if (adapter) {
      try {
        await adapter.deletePrefix("");
      } catch (err) {
        logger.error("workspace storage purge failed; objects orphaned", {
          workspaceId,
          err,
        });
      }
    }

    return {
      data: {
        workspaceId,
        deleted: true,
      },
    };
  },

  async updateWorkspaceDisplayName(
    workspaceId: string,
    displayName: string | null | undefined,
  ) {
    const workspace = await workspaceRepository.updateWorkspaceDisplayName(
      workspaceId,
      normalizeWorkspaceDisplayName(displayName),
    );
    return { workspace };
  },

  async initialize(directory: string) {
    const localPath = normalizeWorkspacePath(directory);
    const existing = await db.findWorkspaceByLocalPath(localPath);
    let workspace = existing;
    if (!workspace) {
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
};
