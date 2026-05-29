import type { TaskProviderConfig } from "./provider-config.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

// Ark Seedream image generation is a synchronous OpenAI-compatible style API
// (POST /images/generations).  It is NOT the video task API (which is async at
// /contents/generations/tasks).  See docs/reference/image/GET.md for the
// authoritative request/response shape, and docs/reference/chat/readme.md for
// the OpenAI-compatible base URL + auth conventions.

export type ArkImageAspectRatio = "9:16" | "16:9" | "1:1";

export interface ArkImageRequest {
  prompt: string;
  negativePrompt?: string;
  /** Reference images for image-to-image / multi-image fusion. URL or `data:image/<fmt>;base64,...` */
  referenceImageUrls?: string[];
  /** How many candidates to generate in one request. The API will return up to this many in `data[]`. */
  count: number;
  aspectRatio: ArkImageAspectRatio;
  /** Optional explicit size override (e.g. "2048x2048", "2K"). Overrides aspectRatio→size mapping. */
  size?: string;
  /** Default false — when true, an AI watermark is burned into the bottom-right. */
  watermark?: boolean;
  /** Pass through if the model supports it (e.g. seedream-3.0-t2i). 5.0-lite/4.5/4.0 ignore. */
  guidanceScale?: number;
  seed?: number;
}

export interface ArkImageCandidate {
  imageUrl: string;
  objectKey?: string;
  seed?: string;
  /** Returned size string for 5.0-lite/4.5/4.0 (e.g. "1600x2848"). */
  size?: string;
}

export interface ArkImageResult {
  provider: "ark-seedream";
  model: string;
  candidates: ArkImageCandidate[];
  /** Per-item errors when the provider returned data[] entries that failed. */
  candidateErrors: Array<{ index: number; code?: string; message?: string }>;
  usage?: {
    generatedImages?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface ArkImageProviderOptions {
  fetch?: typeof fetch;
  traceLogger?: Pick<FileTraceLogger, "append">;
  jobId?: string;
  contractId?: string;
  contractVersion?: string;
}

function joinPath(base: string, p: string) {
  return `${base.replace(/\/+$/, "")}/${p.replace(/^\/+/, "")}`;
}

async function readJson(res: Response): Promise<unknown> {
  const t = await res.text();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(
      `Ark image response was not valid JSON (status ${res.status}): ${t.slice(0, 240)}`,
    );
  }
}

/**
 * Recommended pixel sizes for the documented aspect ratios at the 2K tier of
 * doubao-seedream-5.0-lite / 4.5 / 4.0. See docs/reference/image/GET.md.
 * If the caller passes an explicit `size`, that wins.
 */
function defaultSizeFor(aspectRatio: ArkImageAspectRatio): string {
  switch (aspectRatio) {
    case "9:16":
      return "1600x2848";
    case "16:9":
      return "2848x1600";
    case "1:1":
    default:
      return "2048x2048";
  }
}

export async function generateImagesWithArk(
  req: ArkImageRequest,
  cfg: TaskProviderConfig,
  opts: ArkImageProviderOptions = {},
): Promise<ArkImageResult> {
  const fetchImpl = opts.fetch ?? fetch;

  const referenceImages = req.referenceImageUrls ?? [];
  // The image field is `string/array` per the docs. Pass single string when
  // one ref is provided to keep the request shape minimal.
  const imageField =
    referenceImages.length === 0
      ? undefined
      : referenceImages.length === 1
        ? referenceImages[0]
        : referenceImages;

  const body: Record<string, unknown> = {
    model: cfg.endpointId,
    prompt: req.prompt,
    size: req.size ?? defaultSizeFor(req.aspectRatio),
    response_format: "url",
    watermark: req.watermark ?? false,
  };
  if (imageField !== undefined) body.image = imageField;
  if (req.negativePrompt) body.negative_prompt = req.negativePrompt;
  if (req.seed !== undefined) body.seed = req.seed;
  if (req.guidanceScale !== undefined) body.guidance_scale = req.guidanceScale;
  if (req.count > 1) {
    body.sequential_image_generation = "auto";
    body.sequential_image_generation_options = { max_images: req.count };
  }

  await opts.traceLogger?.append({
    kind: "image.request_started",
    pipeline: "shot_image",
    status: "ok",
    jobId: opts.jobId,
    provider: cfg.provider,
    model: cfg.endpointId,
    ...(opts.contractId ? { contractId: opts.contractId } : {}),
    ...(opts.contractVersion ? { contractVersion: opts.contractVersion } : {}),
    meta: {
      prompt: req.prompt,
      count: req.count,
      aspectRatio: req.aspectRatio,
      size: body.size,
      hasReferenceImages: referenceImages.length > 0,
    },
  });

  const startedAt = Date.now();
  const res = await fetchImpl(joinPath(cfg.baseURL, "images/generations"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    await opts.traceLogger?.append({
      kind: "image.failed",
      pipeline: "shot_image",
      status: "error",
      jobId: opts.jobId,
      provider: cfg.provider,
      model: cfg.endpointId,
      meta: { statusCode: res.status, body: text.slice(0, 240) },
    });
    throw new Error(
      `Ark image generation failed (${res.status}): ${text.slice(0, 240)}`,
    );
  }

  const payload = (await readJson(res)) as {
    model?: string;
    created?: number;
    data?: Array<{
      url?: string;
      b64_json?: string;
      size?: string;
      error?: { code?: string; message?: string };
    }>;
    usage?: {
      generated_images?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
    error?: { code?: string; message?: string };
  };

  // A top-level error means the whole call failed; treat as a thrown error so
  // the worker can mark the batch FAILED.
  if (payload.error?.code || payload.error?.message) {
    const msg = payload.error.message ?? payload.error.code ?? "unknown error";
    await opts.traceLogger?.append({
      kind: "image.failed",
      pipeline: "shot_image",
      status: "error",
      jobId: opts.jobId,
      provider: cfg.provider,
      model: cfg.endpointId,
      meta: { code: payload.error.code, message: msg },
    });
    throw new Error(`Ark image generation error: ${msg}`);
  }

  const data = Array.isArray(payload.data) ? payload.data : [];
  const candidates: ArkImageCandidate[] = [];
  const candidateErrors: ArkImageResult["candidateErrors"] = [];
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    if (entry?.url) {
      candidates.push({
        imageUrl: entry.url,
        ...(entry.size ? { size: entry.size } : {}),
      });
    } else if (entry?.error) {
      candidateErrors.push({
        index: i,
        ...(entry.error.code ? { code: entry.error.code } : {}),
        ...(entry.error.message ? { message: entry.error.message } : {}),
      });
    }
  }

  await opts.traceLogger?.append({
    kind: "image.completed",
    pipeline: "shot_image",
    status: "ok",
    jobId: opts.jobId,
    provider: cfg.provider,
    model: cfg.endpointId,
    latencyMs: Date.now() - startedAt,
    meta: {
      requested: req.count,
      returned: candidates.length,
      failed: candidateErrors.length,
      usage: payload.usage,
    },
  });

  return {
    provider: "ark-seedream",
    model: cfg.endpointId,
    candidates,
    candidateErrors,
    ...(payload.usage
      ? {
          usage: {
            ...(payload.usage.generated_images !== undefined
              ? { generatedImages: payload.usage.generated_images }
              : {}),
            ...(payload.usage.output_tokens !== undefined
              ? { outputTokens: payload.usage.output_tokens }
              : {}),
            ...(payload.usage.total_tokens !== undefined
              ? { totalTokens: payload.usage.total_tokens }
              : {}),
          },
        }
      : {}),
  };
}
