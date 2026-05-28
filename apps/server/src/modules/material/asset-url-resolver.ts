import { readFile as fsReadFile } from "node:fs/promises";
import { db } from "../../db/client.js";
import { logger } from "../../common/logger.js";
import { NotFoundError } from "../../common/errors.js";

export interface AssetLookupResult {
  id: string;
  url: string;
  localPath?: string;
  mime?: string;
}

export interface AssetUrlResolverDeps {
  lookup: (id: string) => Promise<AssetLookupResult | null>;
  readFile: (path: string) => Promise<Buffer>;
}

const DEFAULT_LOOKUP: AssetUrlResolverDeps["lookup"] = async (id) => {
  try {
    const row = await db.getAsset(id);
    const mime = (row.metadata as Record<string, unknown> | null)?.mimeType as string | undefined;
    if (row.url.startsWith("file://")) {
      return { id, url: row.url, localPath: row.url.replace(/^file:\/\//, ""), mime };
    }
    if (row.url.startsWith("http://") || row.url.startsWith("https://")) {
      return { id, url: row.url, mime };
    }
    return { id, url: row.url, localPath: row.url, mime };
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
};

export function createAssetUrlResolver(deps: AssetUrlResolverDeps = { lookup: DEFAULT_LOOKUP, readFile: fsReadFile }) {
  return async function resolveAssetUrls(assetIds: string[]): Promise<string[]> {
    if (assetIds.length === 0) return [];
    const out: string[] = [];
    for (const id of assetIds) {
      const asset = await deps.lookup(id);
      if (!asset) {
        logger.warn("asset-url-resolver: unknown asset id", { id });
        continue;
      }
      if (asset.url.startsWith("https://") || asset.url.startsWith("http://")) {
        out.push(asset.url);
        continue;
      }
      if (asset.localPath) {
        try {
          const bytes = await deps.readFile(asset.localPath);
          const mime = asset.mime ?? "image/png";
          out.push(`data:${mime};base64,${bytes.toString("base64")}`);
        } catch (err) {
          logger.warn("asset-url-resolver: failed to read local file", { id, path: asset.localPath, err: String(err) });
        }
        continue;
      }
      logger.warn("asset-url-resolver: asset has no usable url", { id });
    }
    return out;
  };
}

export const resolveAssetUrls = createAssetUrlResolver();
