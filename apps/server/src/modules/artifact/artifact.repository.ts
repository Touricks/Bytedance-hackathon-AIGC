import { db } from "../../db/client.js";
import type { ImagePromptArtifactRow, VideoScriptArtifactRow } from "../../db/client.js";

export const artifactRepository = {
  async nextImagePromptVersion(shotId: string): Promise<number> {
    const versions = await db.db2.listImagePromptArtifacts(shotId);
    return (versions[0]?.version ?? 0) + 1;
  },
  async nextVideoScriptVersion(shotId: string): Promise<number> {
    const versions = await db.db2.listVideoScriptArtifacts(shotId);
    return (versions[0]?.version ?? 0) + 1;
  },
  async getActiveImagePrompt(shotId: string): Promise<ImagePromptArtifactRow | null> {
    const all = await db.db2.listImagePromptArtifacts(shotId);
    return all.find((a) => a.status === "ACTIVE") ?? null;
  },
  async getActiveVideoScript(shotId: string): Promise<VideoScriptArtifactRow | null> {
    const all = await db.db2.listVideoScriptArtifacts(shotId);
    return all.find((a) => a.status === "ACTIVE") ?? null;
  },
};
