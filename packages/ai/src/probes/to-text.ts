import OpenAI from "openai";
import { loadWorkspaceEnv } from "../env.js";
import {
  resolveArkTextProviderConfig,
  type ProviderEnv
} from "../providers/provider-config.js";
import { createFileTraceLogger, type TraceScope } from "../trace/trace-log.js";
import {
  createProbeTraceId,
  isDirectCliRun,
  readCliOption,
  readLocalImageReference
} from "./probe-utils.js";

interface ToTextProbeModelRequest {
  prompt: string;
  imageDataUrl: string;
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
  callModel?: (
    request: ToTextProbeModelRequest
  ) => Promise<ToTextProbeModelResult>;
}

export interface ToTextProbeResult {
  traceId: string;
  traceFile: string;
  output: string;
  provider: string;
  model: string;
}

async function callConfiguredArkTextModel(
  request: ToTextProbeModelRequest,
  env: ProviderEnv
): Promise<ToTextProbeModelResult> {
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    throw new Error(
      "to-text probe requires Ark text config: ARK_API_KEY and ARK_TEXT_ENDPOINT_ID"
    );
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: request.prompt },
          {
            type: "image_url",
            image_url: { url: request.imageDataUrl, detail: "high" }
          }
        ]
      }
    ],
    temperature: 0
  });

  return {
    provider: config.provider,
    model: config.model,
    output: response.choices[0]?.message.content ?? ""
  };
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
  await traceLogger.append({
    kind: "provider.request_started",
    pipeline: "probe_to_text",
    status: "ok",
    meta: {
      prompt: options.prompt,
      image: image.meta
    }
  });

  try {
    const result = await (options.callModel ??
      ((request: ToTextProbeModelRequest) => {
        loadWorkspaceEnv();
        return callConfiguredArkTextModel(request, options.env ?? process.env);
      }))({
      prompt: options.prompt,
      imageDataUrl: image.imageDataUrl
    });

    await traceLogger.append({
      kind: "provider.response_received",
      pipeline: "probe_to_text",
      status: "ok",
      provider: result.provider,
      model: result.model,
      meta: {
        prompt: options.prompt,
        output: result.output
      }
    });

    return {
      traceId,
      traceFile: traceLogger.filePath,
      output: result.output,
      provider: result.provider,
      model: result.model
    };
  } catch (error) {
    await traceLogger.append({
      kind: "provider.failed",
      pipeline: "probe_to_text",
      status: "error",
      meta: {
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
