import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface LocalImageReference {
  imageDataUrl: string;
  meta: {
    path: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    referenceMode: "data_url";
  };
}

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export function createProbeTraceId(kind: string, date = new Date()) {
  const timestamp = date.toISOString().replace(/[:.]/g, "-");
  return `probe-${timestamp}-${kind}`;
}

export async function readLocalImageReference(
  imagePath: string
): Promise<LocalImageReference> {
  const resolvedPath = path.resolve(imagePath);
  const mimeType = IMAGE_MIME_BY_EXTENSION[path.extname(resolvedPath).toLowerCase()];
  if (!mimeType) {
    throw new Error("Probe image must be a local PNG, JPEG, or WebP file");
  }

  const [fileStat, bytes] = await Promise.all([
    stat(resolvedPath),
    readFile(resolvedPath)
  ]);
  if (!fileStat.isFile()) {
    throw new Error("Probe image path must point to a local file");
  }

  return {
    imageDataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
    meta: {
      path: resolvedPath,
      mimeType,
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      referenceMode: "data_url"
    }
  };
}

export function readCliOption(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) {
    throw new Error(`Missing required option ${name}`);
  }
  return args[index + 1]!;
}

export function isDirectCliRun(moduleUrl: string) {
  return process.argv[1] ? moduleUrl === pathToFileURL(process.argv[1]).href : false;
}
