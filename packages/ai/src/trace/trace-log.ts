import { mkdir, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export type TracePipeline =
  | "creative_blueprint"
  | "one_click_video"
  | "probe_to_text"
  | "probe_image_to_video";

export type TraceStatus = "ok" | "error";

export interface TraceEventInput {
  kind: string;
  pipeline: TracePipeline;
  status: TraceStatus;
  jobId?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  meta?: Record<string, unknown>;
}

export interface TraceEvent extends TraceEventInput {
  at: string;
  scriptId: string;
}

export interface ImageTraceMetaInput {
  url: string;
  referenceMode: string;
  detail?: string;
}

export interface FileTraceLogger {
  traceId: string;
  traceDir: string;
  filePath: string;
  append(event: TraceEventInput): Promise<void>;
}

const SECRET_KEY_PATTERN = /^(api[-_]?key|token|secret)$/i;
const DATA_URL_PATTERN =
  /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi;
const BEARER_PATTERN = /Bearer\s+[a-z0-9._~+/=-]+/gi;

interface FileTraceLoggerOptions {
  traceId: string;
  traceRoot?: string;
  clock?: () => Date;
}

export function getDefaultTraceRoot() {
  return path.resolve(process.env.TRACE_LOG_DIR ?? "logs/trace");
}

export function redactTraceValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(DATA_URL_PATTERN, "data:image/<redacted>;base64,<redacted>")
      .replace(BEARER_PATTERN, "Bearer <redacted>");
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactTraceValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "<redacted>" : redactTraceValue(nested)
      ])
    );
  }

  return value;
}

export function createImageTraceMeta(input: ImageTraceMetaInput) {
  const dataUrlMatch = input.url.match(
    /^data:([^;]+);base64,([a-z0-9+/=_-]+)$/i
  );
  if (dataUrlMatch) {
    const bytes = Buffer.from(dataUrlMatch[2]!, "base64");
    return {
      referenceMode: input.referenceMode,
      detail: input.detail,
      mimeType: dataUrlMatch[1],
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  }

  return {
    referenceMode: input.referenceMode,
    detail: input.detail,
    url: input.url
  };
}

export function createFileTraceLogger(
  options: FileTraceLoggerOptions
): FileTraceLogger {
  const traceRoot = path.resolve(options.traceRoot ?? getDefaultTraceRoot());
  const traceDir = path.join(traceRoot, options.traceId);
  const filePath = path.join(traceDir, "events.jsonl");
  const clock = options.clock ?? (() => new Date());

  return {
    traceId: options.traceId,
    traceDir,
    filePath,
    async append(event) {
      await mkdir(traceDir, { recursive: true });
      const traceEvent: TraceEvent = {
        at: clock().toISOString(),
        scriptId: options.traceId,
        ...event
      };
      await appendFile(
        filePath,
        `${JSON.stringify(redactTraceValue(traceEvent))}\n`,
        "utf8"
      );
    }
  };
}
