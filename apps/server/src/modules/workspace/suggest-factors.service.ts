import { suggestCreativeFactors } from "@aigc-video/ai";
import { materialIntakeArtifactSchema } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import {
  applySelectedMaterialRefs,
  collectWorkspaceMaterialLibraryForWorkspace,
  materialIntakeImageInputsForWorkspace,
  runtimeMode
} from "./workspace.service.js";

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

    const imageInputs =
      runtimeMode() === "real"
        ? await materialIntakeImageInputsForWorkspace(workspaceId, scanned)
        : [];

    return suggestCreativeFactors({ imageInputs });
  }
};
