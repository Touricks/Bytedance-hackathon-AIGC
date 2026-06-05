import type { Readable } from "node:stream";
import type { WorkspaceStorageBindingRow } from "../../../db/client.js";

export interface WorkspaceStorageObjectInfo {
  relativePath: string;
  size: number | null;
  contentType: string | null;
  lastModified: Date | null;
}

export interface WorkspaceStorageAdapter {
  kind: "LOCAL" | "S3";
  binding: WorkspaceStorageBindingRow;
  putObject(input: {
    relativePath: string;
    body: Uint8Array | string;
    contentType?: string;
  }): Promise<WorkspaceStorageObjectInfo>;
  readObject(relativePath: string): Promise<Buffer>;
  streamObject(relativePath: string): Promise<Readable>;
  deleteObject(relativePath: string): Promise<void>;
  listObjects(prefix: string): Promise<WorkspaceStorageObjectInfo[]>;
  statObject(relativePath: string): Promise<WorkspaceStorageObjectInfo>;
  exists(relativePath: string): Promise<boolean>;
  downloadToTemp(relativePath: string, targetPath: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}
