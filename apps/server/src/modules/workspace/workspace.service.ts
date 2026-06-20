import { workspaceLifecycleService } from "./workspace-lifecycle.service.js";
import { workspaceMaterialService } from "./workspace-material.service.js";
import { workspaceStatusService } from "./workspace-status.service.js";
import { workspaceStorageBindingService } from "./workspace-storage-binding.service.js";

export const workspaceService = {
  createManagedWorkspace(name?: string) {
    return workspaceLifecycleService.createManagedWorkspace(name);
  },

  listManagedWorkspaces() {
    return workspaceLifecycleService.listManagedWorkspaces();
  },

  deleteWorkspace(workspaceId: string) {
    return workspaceLifecycleService.deleteWorkspace(workspaceId);
  },

  initialize(directory: string) {
    return workspaceLifecycleService.initialize(directory);
  },

  getWorkspaceDirectory(workspaceId: string) {
    return workspaceStorageBindingService.getWorkspaceDirectory(workspaceId);
  },

  getWorkspaceStorage(workspaceId: string) {
    return workspaceStorageBindingService.getWorkspaceStorage(workspaceId);
  },

  bindWorkspaceStorage(
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
    return workspaceStorageBindingService.bindWorkspaceStorage(
      workspaceId,
      input,
    );
  },

  status: workspaceStatusService.status,

  uploadMaterial(input: {
    workspaceId: string;
    filename: string;
    bytes: Uint8Array;
  }) {
    return workspaceMaterialService.uploadMaterial(input);
  },

  deleteMaterial(input: { workspaceId: string; ref: string }) {
    return workspaceMaterialService.deleteMaterial(input);
  },
};
