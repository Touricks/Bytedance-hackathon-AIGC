import type { TaskProviderConfig } from "./provider-config.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export interface ArkImageRequest {
  prompt: string;
  negativePrompt?: string;
  referenceImageUrls?: string[];
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  seed?: number;
}
export interface ArkImageCandidate {
  imageUrl: string;
  objectKey?: string;
  seed?: string;
}
export interface ArkImageResult {
  provider: "ark-seedream";
  model: string;
  candidates: ArkImageCandidate[];
}

export interface ArkImageProviderOptions {
  fetch?: typeof fetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  traceLogger?: Pick<FileTraceLogger, "append">;
  jobId?: string;
  contractId?: string;
  contractVersion?: string;
}

function joinPath(base: string, p: string) {
  return `${base.replace(/\/+$/, "")}/${p.replace(/^\/+/, "")}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readJson(res: Response) {
  const t = await res.text();
  return t ? JSON.parse(t) : {};
}

function extractImageUrls(payload: unknown): string[] {
  const urls: string[] = [];
  const visit = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (typeof v !== "object") return;
    const r = v as Record<string, unknown>;
    for (const key of ["url", "image_url", "imageUrl"]) {
      const candidate = r[key];
      if (typeof candidate === "string") urls.push(candidate);
    }
    for (const key of ["images", "data", "result", "output", "results", "items", "content"]) {
      visit(r[key]);
    }
  };
  visit(payload);
  return urls;
}

function extractTaskId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  for (const k of ["id", "task_id", "taskId"]) {
    if (typeof r[k] === "string") return r[k] as string;
  }
  for (const k of ["data", "result", "output"]) {
    if (r[k] && typeof r[k] === "object") {
      const id = extractTaskId(r[k]);
      if (id) return id;
    }
  }
  return null;
}

function extractTaskStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  for (const k of ["status", "task_status", "taskStatus"]) {
    if (typeof r[k] === "string") return (r[k] as string).toLowerCase();
  }
  for (const k of ["data", "result", "output"]) {
    if (r[k] && typeof r[k] === "object") {
      const s = extractTaskStatus(r[k]);
      if (s) return s;
    }
  }
  return null;
}

export async function generateImagesWithArk(
  req: ArkImageRequest,
  cfg: TaskProviderConfig,
  opts: ArkImageProviderOptions = {},
): Promise<ArkImageResult> {
  const fetchImpl = opts.fetch ?? fetch;
  const pollIntervalMs = opts.pollIntervalMs ?? 5000;
  const maxAttempts = opts.maxPollAttempts ?? 30;

  await opts.traceLogger?.append({
    kind: "image.task_create_started",
    pipeline: "shot_image",
    status: "ok",
    jobId: opts.jobId,
    provider: cfg.provider,
    model: cfg.endpointId,
    ...(opts.contractId ? { contractId: opts.contractId } : {}),
    ...(opts.contractVersion ? { contractVersion: opts.contractVersion } : {}),
    meta: { prompt: req.prompt, count: req.count, aspectRatio: req.aspectRatio },
  });

  const createRes = await fetchImpl(joinPath(cfg.baseURL, "contents/generations/tasks"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.endpointId,
      content: [
        { type: "text", text: req.prompt },
        ...(req.referenceImageUrls ?? []).map((url) => ({ type: "image_url", image_url: { url } })),
      ],
      n: req.count,
      ratio: req.aspectRatio,
      ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Ark image task create failed (${createRes.status}): ${body.slice(0, 240)}`);
  }

  const createPayload = await readJson(createRes);
  const immediate = extractImageUrls(createPayload);
  if (immediate.length > 0) {
    return {
      provider: "ark-seedream",
      model: cfg.endpointId,
      candidates: immediate.slice(0, req.count).map((url) => ({ imageUrl: url })),
    };
  }

  const taskId = extractTaskId(createPayload);
  if (!taskId) throw new Error("Ark image task create did not return a task id");

  const taskUrl = joinPath(cfg.baseURL, `contents/generations/tasks/${taskId}`);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetchImpl(taskUrl, { method: "GET", headers: { Authorization: `Bearer ${cfg.apiKey}` } });
    if (!res.ok) {
      throw new Error(`Ark image task poll failed (${res.status})`);
    }
    const payload = await readJson(res);
    const status = extractTaskStatus(payload);
    await opts.traceLogger?.append({
      kind: "image.task_polled",
      pipeline: "shot_image",
      status: "ok",
      jobId: opts.jobId,
      provider: cfg.provider,
      model: cfg.endpointId,
      ...(opts.contractId ? { contractId: opts.contractId } : {}),
      ...(opts.contractVersion ? { contractVersion: opts.contractVersion } : {}),
      meta: { taskId, status },
    });
    if (status && ["failed", "fail", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(`Ark image task ${taskId} failed`);
    }
    const urls = extractImageUrls(payload);
    if (urls.length > 0) {
      const candidates = urls.slice(0, req.count).map((url) => ({ imageUrl: url }));
      await opts.traceLogger?.append({
        kind: "image.completed",
        pipeline: "shot_image",
        status: "ok",
        jobId: opts.jobId,
        provider: cfg.provider,
        model: cfg.endpointId,
        ...(opts.contractId ? { contractId: opts.contractId } : {}),
        ...(opts.contractVersion ? { contractVersion: opts.contractVersion } : {}),
        meta: { taskId, count: candidates.length },
      });
      return { provider: "ark-seedream", model: cfg.endpointId, candidates };
    }
    if (i < maxAttempts - 1) await sleep(pollIntervalMs);
  }
  throw new Error(`Ark image task ${taskId} did not complete in time`);
}
