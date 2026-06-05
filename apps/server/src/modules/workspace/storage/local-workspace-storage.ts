import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { WorkspaceStorageBindingRow } from "../../../db/client.js";
import { HttpError } from "../../../common/errors.js";
import type {
  WorkspaceStorageAdapter,
  WorkspaceStorageObjectInfo,
} from "./workspace-storage.adapter.js";
import { normalizeWorkspaceRelativePath } from "./workspace-storage.keys.js";

function contentTypeFromPath(relativePath: string) {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".txt") return "text/plain";
  if (ext === ".md") return "text/markdown";
  return null;
}

function isInsideDirectory(filePath: string, rootPath: string) {
  const relative = path.relative(rootPath, filePath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export class LocalWorkspaceStorageAdapter implements WorkspaceStorageAdapter {
  kind = "LOCAL" as const;
  binding: WorkspaceStorageBindingRow;
  private rootPath: string;

  constructor(binding: WorkspaceStorageBindingRow) {
    if (!binding.localPath) {
      throw new HttpError(409, "STORAGE_NOT_LOCAL", "Local storage path is missing");
    }
    this.binding = binding;
    this.rootPath = path.resolve(binding.localPath, ".daireel");
  }

  private pathFor(relativePath: string) {
    const safePath = normalizeWorkspaceRelativePath(relativePath);
    const filePath = path.resolve(this.rootPath, safePath);
    if (!isInsideDirectory(filePath, this.rootPath)) {
      throw new HttpError(
        400,
        "INVALID_WORKSPACE_STORAGE_PATH",
        "Workspace storage path must stay inside the workspace storage root",
      );
    }
    return { safePath, filePath };
  }

  private async info(relativePath: string, filePath: string): Promise<WorkspaceStorageObjectInfo> {
    const fileStats = await stat(filePath);
    return {
      relativePath,
      size: fileStats.size,
      contentType: contentTypeFromPath(relativePath),
      lastModified: fileStats.mtime,
    };
  }

  async putObject(input: {
    relativePath: string;
    body: Uint8Array | string;
    contentType?: string;
  }) {
    const { safePath, filePath } = this.pathFor(input.relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
    return this.info(safePath, filePath);
  }

  async readObject(relativePath: string) {
    const { filePath } = this.pathFor(relativePath);
    return readFile(filePath);
  }

  async streamObject(relativePath: string) {
    const { filePath } = this.pathFor(relativePath);
    await stat(filePath);
    return createReadStream(filePath);
  }

  async deleteObject(relativePath: string) {
    const { filePath } = this.pathFor(relativePath);
    await rm(filePath, { force: true });
  }

  async listObjects(prefix: string) {
    const normalizedPrefix = prefix ? normalizeWorkspaceRelativePath(prefix) : "";
    const root = normalizedPrefix
      ? this.pathFor(normalizedPrefix).filePath
      : this.rootPath;
    const output: WorkspaceStorageObjectInfo[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        if (
          typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return;
        }
        throw error;
      }
      for (const entry of entries) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(filePath);
          continue;
        }
        if (!entry.isFile()) continue;
        const relativePath = path.relative(this.rootPath, filePath).replace(/\\/g, "/");
        output.push(await this.info(relativePath, filePath));
      }
    };

    await walk(root);
    return output.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  async statObject(relativePath: string) {
    const { safePath, filePath } = this.pathFor(relativePath);
    return this.info(safePath, filePath);
  }

  async exists(relativePath: string) {
    const { filePath } = this.pathFor(relativePath);
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

  async downloadToTemp(relativePath: string, targetPath: string) {
    const { filePath } = this.pathFor(relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(filePath, targetPath);
  }

  async deletePrefix(prefix: string) {
    const filePath = prefix ? this.pathFor(prefix).filePath : this.rootPath;
    await rm(filePath, { recursive: true, force: true });
  }
}
