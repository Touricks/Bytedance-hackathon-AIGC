import { loadWorkspaceEnv } from "../env.js";
import {
  generateTextWithArk,
  type ArkTextProviderOptions
} from "../providers/ark-text.provider.js";
import {
  resolveArkTextProviderConfig,
  type ProviderEnv
} from "../providers/provider-config.js";
import {
  createFileTraceLogger,
  type FileTraceLogger,
  type TraceScope
} from "../trace/trace-log.js";
import {
  createProbeTraceId,
  isDirectCliRun,
  readCliOption,
  readLocalImageReference,
  type LocalImageReference
} from "./probe-utils.js";

interface ToTextProbeModelInput {
  prompt: string;
  imageDataUrl: string;
  imageMeta: LocalImageReference["meta"];
  traceLogger: Pick<FileTraceLogger, "append">;
}

interface ToTextProbeModelResult {
  provider: string;
  model: string;
  output: string;
}

export interface RunToTextProbeOptions {
  imagePath: string;
  prompt: string;
  traceRoot?: string;
  traceScope?: TraceScope;
  traceId?: string;
  env?: ProviderEnv;
  createClient?: ArkTextProviderOptions["createClient"];
}

export interface ToTextProbeResult {
  traceId: string;
  traceFile: string;
  output: string;
  provider: string;
  model: string;
}

async function callConfiguredArkTextModel(
  request: ToTextProbeModelInput,
  env: ProviderEnv,
  createClient?: ArkTextProviderOptions["createClient"]
): Promise<ToTextProbeModelResult> {
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    throw new Error(
      "to-text probe requires Ark text config: ARK_API_KEY, ARK_BASE_URL, and ARK_TEXT_ENDPOINT_ID"
    );
  }

  return generateTextWithArk(
    {
      prompt: request.prompt,
      content: [
        { type: "text", text: request.prompt },
        {
          type: "image_url",
          image_url: { url: request.imageDataUrl, detail: "high" }
        }
      ]
    },
    config,
    {
      createClient,
      temperature: 0,
      traceLogger: request.traceLogger,
      trace: {
        pipeline: "probe_to_text",
        meta: {
          prompt: request.prompt,
          imageReferenceMode: "data_url",
          image: request.imageMeta
        }
      }
    }
  );
}

export async function runToTextProbe(
  options: RunToTextProbeOptions
): Promise<ToTextProbeResult> {
  const traceId = options.traceId ?? createProbeTraceId("to-text");
  const traceLogger = createFileTraceLogger({
    traceId,
    traceRoot: options.traceRoot,
    traceScope: options.traceScope ?? "tests"
  });
  const image = await readLocalImageReference(options.imagePath);

  await traceLogger.append({
    kind: "probe.image_prepared",
    pipeline: "probe_to_text",
    status: "ok",
    meta: {
      ...image.meta,
      imageDataUrl: image.imageDataUrl
    }
  });

  try {
    loadWorkspaceEnv();
    const result = await callConfiguredArkTextModel(
      {
        prompt: options.prompt,
        imageDataUrl: image.imageDataUrl,
        imageMeta: image.meta,
        traceLogger
      },
      options.env ?? process.env,
      options.createClient
    );

    return {
      traceId,
      traceFile: traceLogger.filePath,
      output: result.output,
      provider: result.provider,
      model: result.model
    };
  } catch (error) {
    await traceLogger.append({
      kind: "probe.failed",
      pipeline: "probe_to_text",
      status: "error",
      meta: {
        prompt: options.prompt,
        error: error instanceof Error ? error.message : "Unknown probe failure"
      }
    });
    throw error;
  }
}

if (isDirectCliRun(import.meta.url)) {
  runToTextProbe({
    imagePath: readCliOption(process.argv.slice(2), "--image"),
    prompt: readCliOption(process.argv.slice(2), "--prompt")
  })
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            traceId: result.traceId,
            traceFile: result.traceFile,
            provider: result.provider,
            model: result.model,
            output: result.output
          },
          null,
          2
        )
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
