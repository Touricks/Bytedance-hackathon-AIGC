import sharp from "sharp";
import { suggestCreativeFactors } from "@aigc-video/ai";
import { materialIntakeArtifactSchema } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import {
  applySelectedMaterialRefs,
  collectWorkspaceMaterialLibraryForWorkspace,
  materialIntakeImageInputsForWorkspace,
  runtimeMode
} from "./workspace.service.js";

async function resizeForSuggest(dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl;
  const b64 = dataUrl.slice(comma + 1);
  const buf = Buffer.from(b64, "base64");
  // Resize to max 512px on the longest edge, JPEG 75% quality → ~30-60KB
  const resized = await sharp(buf)
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}

export const suggestFactorsService = {
  async suggest(workspaceId: string) {
    await db.getWorkspace(workspaceId);

    const materialLibrary =
      await collectWorkspaceMaterialLibraryForWorkspace(workspaceId);
    const selectedLibrary = applySelectedMaterialRefs(materialLibrary, undefined);
    const scanned = materialIntakeArtifactSchema.parse({
      ...selectedLibrary,
      primaryProductRef: selectedLibrary.primaryProductRef ?? ""
    });

    const rawImageInputs =
      runtimeMode() === "real"
        ? await materialIntakeImageInputsForWorkspace(workspaceId, scanned)
        : [];

    // Prioritize primary product image, take up to 3.
    const primaryRef = scanned.primaryProductRef;
    const sorted = primaryRef
      ? [
          ...rawImageInputs.filter((i) => i.ref === primaryRef),
          ...rawImageInputs.filter((i) => i.ref !== primaryRef)
        ]
      : rawImageInputs;
    const picked = sorted.slice(0, 3);

    // Resize to 512px + JPEG 75% for fast transfer — in-memory only, original files untouched.
    const imageInputs = await Promise.all(
      picked.map(async (img) => ({
        ...img,
        detail: "low" as const,
        url: await resizeForSuggest(img.url)
      }))
    );

    return suggestCreativeFactors({ imageInputs });
  }
};
