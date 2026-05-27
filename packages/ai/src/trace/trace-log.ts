import { mkdir, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadWorkspaceEnv, resolveWorkspacePath } from "../env.js";

export type TracePipeline =
  | "creative_blueprint"
  | "material_intake"
  | "product_brief"
  | "feedback"
  | "shotprompt"
  | "storyboard"
  | "one_click_video"
  | "probe_to_text"
  | "probe_image_to_video";

export type TraceStatus = "ok" | "error";
export type TraceScope = "users" | "tests";

export interface TraceEventInput {
  kind: string;
  pipeline: TracePipeline;
  status: TraceStatus;
  workspaceId?: string;
  jobId?: string;
  provider?: string;
  model?: string;
  contractId?: string;
  contractVersion?: string;
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
  traceScope: TraceScope;
  traceBatchId: string;
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
  workspaceId?: string;
  traceFilePath?: string;
  traceRoot?: string;
  traceScope?: TraceScope;
  clock?: () => Date;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatTraceBatchTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());
  const second = padDatePart(date.getSeconds());
  return `${year}${month}${day}${hour}-${minute}-${second}`;
}

const defaultTraceBatchId = formatTraceBatchTimestamp(new Date());

export function getDefaultTraceBatchId() {
  return defaultTraceBatchId;
}

function requireTraceLogDir() {
  const value = process.env.TRACE_LOG_DIR;
  if (!value) {
    throw new Error(
      "TRACE_LOG_DIR is required. File trace storage must be explicit; no logs/trace fallback is allowed."
    );
  }
  return value;
}

export function getDefaultTraceRoot() {
  const workspaceRoot = loadWorkspaceEnv() ?? process.cwd();
  return resolveWorkspacePath(requireTraceLogDir(), workspaceRoot);
}

export function resolveTraceScope(traceScope?: TraceScope): TraceScope {
  const value = traceScope ?? process.env.TRACE_LOG_SCOPE ?? "users";
  if (value === "users" || value === "tests") {
    return value;
  }

  throw new Error(
    `TRACE_LOG_SCOPE must be "users" or "tests"; received ${JSON.stringify(value)}`
  );
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
  loadWorkspaceEnv();
  const traceRoot = options.traceFilePath
    ? undefined
    : path.resolve(options.traceRoot ?? getDefaultTraceRoot());
  const traceScope = options.traceFilePath
    ? resolveTraceScope(options.traceScope ?? "users")
    : resolveTraceScope(options.traceScope);
  const traceBatchId = getDefaultTraceBatchId();
  const filePath = options.traceFilePath
    ? path.resolve(options.traceFilePath)
    : path.join(
        traceScope === "users"
          ? path.join(traceRoot!, traceScope, traceBatchId)
          : path.join(traceRoot!, traceScope, traceBatchId, options.traceId),
        "events.jsonl"
      );
  const traceDir = path.dirname(filePath);
  const clock = options.clock ?? (() => new Date());

  return {
    traceId: options.traceId,
    traceScope,
    traceBatchId,
    traceDir,
    filePath,
    async append(event) {
      await mkdir(traceDir, { recursive: true });
      const traceEvent: TraceEvent = {
        at: clock().toISOString(),
        workspaceId: options.workspaceId,
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
