import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { redactTraceValue } from "@aigc-video/ai";
import type { WorkspaceStorageBindingRow } from "../../db/client.js";
import { getWorkspaceStorageAdapter } from "../workspace/storage/workspace-storage-resolver.js";

function serializeTraceLine(event: Record<string, unknown>) {
  let line = "";
  const logger = pino(
    {
      base: null,
      timestamp: false,
    },
    {
      write(message: string) {
        line += message;
      },
    },
  );
  logger.info(redactTraceValue(event) as Record<string, unknown>);
  return line.endsWith("\n") ? line : `${line}\n`;
}

function safeTimestamp(value: unknown) {
  const timestamp = typeof value === "string" ? value : new Date().toISOString();
  return timestamp.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
}

function s3TraceObjectPath(category: string, event: Record<string, unknown>) {
  return `trace/${category}/${safeTimestamp(event.at)}-${randomUUID()}.jsonl`;
}

export async function appendTraceJsonlFile(input: {
  filePath: string;
  event: Record<string, unknown>;
}) {
  await mkdir(path.dirname(input.filePath), { recursive: true });
  await appendFile(input.filePath, serializeTraceLine(input.event), "utf8");
}

export async function putTraceJsonlObject(input: {
  workspaceId: string;
  category: string;
  event: Record<string, unknown>;
}) {
  const adapter = await getWorkspaceStorageAdapter(input.workspaceId);
  const objectPath = s3TraceObjectPath(input.category, input.event);
  await adapter.putObject({
    relativePath: objectPath,
    body: serializeTraceLine(input.event),
    contentType: "application/x-ndjson",
  });
  return objectPath;
}

export async function mirrorWorkspaceTraceJsonl(input: {
  workspaceId: string;
  binding: WorkspaceStorageBindingRow | null;
  localRelativePath: string;
  s3Category: string;
  event: Record<string, unknown>;
  s3Event?: Record<string, unknown>;
}) {
  if (input.binding?.kind === "LOCAL" && input.binding.localPath) {
    await appendTraceJsonlFile({
      filePath: path.join(input.binding.localPath, input.localRelativePath),
      event: input.event,
    });
    return null;
  }

  if (input.binding?.kind === "S3") {
    return putTraceJsonlObject({
      workspaceId: input.workspaceId,
      category: input.s3Category,
      event: input.s3Event ?? input.event,
    });
  }

  return null;
}
