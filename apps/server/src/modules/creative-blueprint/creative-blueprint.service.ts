import {
  createFileTraceLogger,
  generateCreativeBlueprintWithArk,
  type CreativeBlueprintImageInput,
  type FileTraceLogger
} from "@aigc-video/ai";
import type {
  Asset,
  CreateCreativeBlueprintRequest,
  CreativeBlueprint
} from "@aigc-video/shared";
import { nanoid } from "nanoid";
import { db } from "../../db/client.js";
import { resolveSeedanceImageInput } from "../../jobs/seedance-image-input.js";
import { creativeBlueprintRepository } from "./creative-blueprint.repository.js";

class CreativeBlueprintTraceError extends Error {
  constructor(
    readonly scriptId: string,
    error: unknown
  ) {
    super(error instanceof Error ? error.message : "Unknown blueprint failure");
    this.name = "CreativeBlueprintTraceError";
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown blueprint failure";
}

function hasArkTextProviderConfig() {
  return Boolean(process.env.ARK_API_KEY && process.env.ARK_TEXT_ENDPOINT_ID);
}

function getImageReferenceMode(
  resolvedImageUrl: string
): CreativeBlueprintImageInput["mode"] {
  if (resolvedImageUrl.startsWith("data:image/")) {
    return "data_url";
  }
  if (resolvedImageUrl.startsWith("asset://")) {
    return "provider_asset";
  }
  return "url";
}

async function resolveCreativeBlueprintImageInput(
  imageAsset: Asset
): Promise<CreativeBlueprintImageInput | undefined> {
  if (!hasArkTextProviderConfig()) {
    return undefined;
  }

  const resolvedImageUrl = await resolveSeedanceImageInput(imageAsset);
  return {
    url: resolvedImageUrl,
    mode: getImageReferenceMode(resolvedImageUrl),
    detail: "high"
  };
}

async function generateBlueprint(
  input: CreateCreativeBlueprintRequest,
  imageAsset: Asset,
  traceLogger: Pick<FileTraceLogger, "append">
): Promise<{
  creativeBlueprint: CreativeBlueprint;
  trace: unknown;
  provider: "ark" | "fallback";
}> {
  const imageInput = await resolveCreativeBlueprintImageInput(imageAsset);
  const result = await generateCreativeBlueprintWithArk(input, {
    imageInput,
    traceLogger
  });
  return {
    creativeBlueprint: result.creativeBlueprint,
    trace: result.trace,
    provider: result.provider
  };
}

function createReadyShots(creativeBlueprint: CreativeBlueprint) {
  return creativeBlueprint.shots.map((shot) => ({
    index: shot.index,
    durationSec: shot.durationSec,
    purpose: shot.purpose,
    visualPrompt: shot.visualPrompt,
    cameraMotion: shot.cameraMotion,
    voiceover: shot.voiceover,
    subtitle: shot.subtitle,
    status: "ready" as const
  }));
}

export const creativeBlueprintService = {
  async createCreativeBlueprint(input: CreateCreativeBlueprintRequest) {
    if (input.draftScriptId) {
      const draft = await db.getScript(input.draftScriptId);
      if (!draft.frozen) {
        const traceLogger = createFileTraceLogger({ traceId: draft.id });
        await traceLogger.append({
          kind: "session.started",
          pipeline: "creative_blueprint",
          status: "ok",
          meta: { draftScriptId: draft.id }
        });
        try {
          const imageAsset =
            await creativeBlueprintRepository.findOrCreateProductImageAsset(
              input.imageUrl
            );
          const product = await db.updateProduct(draft.productId, {
            title: input.title,
            sellingPoints: input.sellingPoints,
            audience: input.audience,
            mainImageAssetId: imageAsset.id
          });
          const {
            creativeBlueprint,
            trace: modelTrace,
            provider
          } = await generateBlueprint(input, imageAsset, traceLogger);
          const script = await db.updateScript(draft.id, {
            narrative: creativeBlueprint.narrative,
            visualStyle: creativeBlueprint.visualStyle,
            rawJson: { creativeBlueprint, trace: modelTrace }
          });
          const shots = await db.replaceShots(
            script.id,
            createReadyShots(creativeBlueprint)
          );
          await traceLogger.append({
            kind: "blueprint.completed",
            pipeline: "creative_blueprint",
            status: "ok",
            provider
          });

          return {
            scriptId: script.id,
            product,
            imageAsset,
            script,
            creativeBlueprint,
            trace: modelTrace,
            provider,
            shots
          };
        } catch (error) {
          await traceLogger.append({
            kind: "blueprint.failed",
            pipeline: "creative_blueprint",
            status: "error",
            meta: { error: errorMessage(error) }
          });
          throw new CreativeBlueprintTraceError(draft.id, error);
        }
      }
    }

    const scriptId = nanoid();
    const trace = createFileTraceLogger({ traceId: scriptId });
    await trace.append({
      kind: "session.started",
      pipeline: "creative_blueprint",
      status: "ok"
    });
    try {
      const { product, imageAsset } =
        await creativeBlueprintRepository.createDraft(input);
      const {
        creativeBlueprint,
        trace: modelTrace,
        provider
      } = await generateBlueprint(input, imageAsset, trace);
      const parentScript = input.draftScriptId
        ? await db.getScript(input.draftScriptId)
        : null;

      const script = await db.createScript({
        id: scriptId,
        productId: product.id,
        parentScriptId: parentScript?.id,
        version: parentScript ? parentScript.version + 1 : 1,
        narrative: creativeBlueprint.narrative,
        visualStyle: creativeBlueprint.visualStyle,
        frozen: false,
        rawJson: { creativeBlueprint, trace: modelTrace }
      });

      const shots = await db.createShots(
        script.id,
        createReadyShots(creativeBlueprint)
      );
      await trace.append({
        kind: "blueprint.completed",
        pipeline: "creative_blueprint",
        status: "ok",
        provider
      });

      return {
        scriptId: script.id,
        product,
        imageAsset,
        script,
        creativeBlueprint,
        trace: modelTrace,
        provider,
        shots
      };
    } catch (error) {
      await trace.append({
        kind: "blueprint.failed",
        pipeline: "creative_blueprint",
        status: "error",
        meta: { error: errorMessage(error) }
      });
      throw new CreativeBlueprintTraceError(scriptId, error);
    }
  },

  getCreativeBlueprint(scriptId: string) {
    return creativeBlueprintRepository.getBlueprint(scriptId);
  },

  freezeCreativeBlueprint(scriptId: string) {
    return db.freezeScript(scriptId);
  },

  async createGenerationAttempt(scriptId: string) {
    const script = await db.getScript(scriptId);
    return db.createJob({
      productId: script.productId,
      scriptId,
      payload: { scriptId }
    });
  }
};
