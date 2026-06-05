import { db, type WorkspaceStorageBindingRow } from "../../../db/client.js";
import { HttpError } from "../../../common/errors.js";
import { LocalWorkspaceStorageAdapter } from "./local-workspace-storage.js";
import { S3WorkspaceStorageAdapter } from "./s3-workspace-storage.js";
import type { WorkspaceStorageAdapter } from "./workspace-storage.adapter.js";

type AdapterFactoryOverride = (
  binding: WorkspaceStorageBindingRow,
) => WorkspaceStorageAdapter;

let adapterFactoryOverride: AdapterFactoryOverride | undefined;

export function __setWorkspaceStorageAdapterFactoryForTests(
  factory: AdapterFactoryOverride | undefined,
) {
  adapterFactoryOverride = factory;
}

export function createWorkspaceStorageAdapter(
  binding: WorkspaceStorageBindingRow,
): WorkspaceStorageAdapter {
  if (adapterFactoryOverride) {
    return adapterFactoryOverride(binding);
  }
  return binding.kind === "LOCAL"
    ? new LocalWorkspaceStorageAdapter(binding)
    : new S3WorkspaceStorageAdapter(binding);
}

export async function getWorkspaceStorageAdapter(workspaceId: string) {
  const binding = await db.getActiveWorkspaceStorage(workspaceId);
  if (!binding) {
    throw new HttpError(
      409,
      "STORAGE_NOT_BOUND",
      "Workspace storage is not bound",
    );
  }
  return createWorkspaceStorageAdapter(binding);
}

export async function getWorkspaceStorageKind(workspaceId: string) {
  return (await getWorkspaceStorageAdapter(workspaceId)).kind;
}
