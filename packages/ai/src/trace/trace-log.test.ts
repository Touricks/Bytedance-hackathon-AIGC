import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createFileTraceLogger, redactTraceValue } from "./trace-log.js";

describe("file trace logger", () => {
  it("appends JSONL events under the trace id directory", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "aigc-trace-"));
    const logger = createFileTraceLogger({
      traceId: "script_123",
      traceRoot,
      clock: () => new Date("2026-05-23T12:00:00.000Z")
    });

    await logger.append({
      kind: "session.started",
      pipeline: "creative_blueprint",
      status: "ok",
      meta: { prompt: "hello" }
    });
    await logger.append({
      kind: "provider.response_received",
      pipeline: "creative_blueprint",
      status: "ok",
      latencyMs: 12
    });

    assert.equal(logger.traceId, "script_123");
    assert.equal(logger.filePath, path.join(traceRoot, "script_123", "events.jsonl"));

    const lines = (await readFile(logger.filePath, "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]!), {
      at: "2026-05-23T12:00:00.000Z",
      scriptId: "script_123",
      kind: "session.started",
      pipeline: "creative_blueprint",
      status: "ok",
      meta: { prompt: "hello" }
    });
    assert.equal(JSON.parse(lines[1]!).latencyMs, 12);
  });

  it("redacts secrets and data URLs without removing prompt text", () => {
    const redacted = redactTraceValue({
      prompt: "Full prompt should stay visible",
      output: "Full text output should stay visible",
      authorization: "Bearer secret-token",
      apiKey: "secret-api-key",
      imageUrl: "data:image/png;base64,c2Vuc2l0aXZl",
      nested: {
        header: "Authorization: Bearer nested-token"
      }
    });

    assert.deepEqual(redacted, {
      prompt: "Full prompt should stay visible",
      output: "Full text output should stay visible",
      authorization: "Bearer <redacted>",
      apiKey: "<redacted>",
      imageUrl: "data:image/<redacted>;base64,<redacted>",
      nested: {
        header: "Authorization: Bearer <redacted>"
      }
    });
  });
});
