import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import {
  createFileTraceLogger,
  formatTraceBatchTimestamp,
  getDefaultTraceBatchId,
  redactTraceValue
} from "./trace-log.js";

const traceLogModuleUrl = pathToFileURL(
  path.resolve("src/trace/trace-log.ts")
).href;
const tsxBin = path.resolve("node_modules/.bin/tsx");

function withoutTraceEnv() {
  const env = { ...process.env };
  delete env.TRACE_LOG_DIR;
  delete env.TRACE_LOG_SCOPE;
  delete env.AIGC_VIDEO_SKIP_ENV_FILE;
  return env;
}

describe("file trace logger", () => {
  it("formats local-time trace batch timestamps", () => {
    assert.equal(
      formatTraceBatchTimestamp(new Date(2026, 4, 24, 7, 8, 9)),
      "2026052407-08-09"
    );
  });

  it("uses one default trace batch id across loggers in the same process", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "aigc-trace-"));

    try {
      const firstLogger = createFileTraceLogger({
        traceId: "script_123",
        traceRoot,
        traceScope: "tests"
      });
      const secondLogger = createFileTraceLogger({
        traceId: "script_456",
        traceRoot,
        traceScope: "tests"
      });

      assert.equal(firstLogger.traceBatchId, secondLogger.traceBatchId);
      assert.equal(firstLogger.traceBatchId, getDefaultTraceBatchId());
    } finally {
      await rm(traceRoot, { recursive: true, force: true });
    }
  });

  it("appends JSONL events under the scoped trace id directory", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "aigc-trace-"));
    const logger = createFileTraceLogger({
      traceId: "script_123",
      traceRoot,
      traceScope: "tests",
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
    assert.equal(logger.traceScope, "tests");
    assert.equal(logger.traceBatchId, getDefaultTraceBatchId());
    assert.equal(
      logger.filePath,
      path.join(
        traceRoot,
        "tests",
        getDefaultTraceBatchId(),
        "script_123",
        "events.jsonl"
      )
    );

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

  it("fails loudly when the default trace root is not configured", () => {
    const result = spawnSync(
      tsxBin,
      [
        "--eval",
        `import(${JSON.stringify(traceLogModuleUrl)})
          .then(({ createFileTraceLogger }) => {
            createFileTraceLogger({ traceId: "script_123" });
            process.exit(0);
          })
          .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          });`
      ],
      {
        env: {
          ...withoutTraceEnv(),
          AIGC_VIDEO_SKIP_ENV_FILE: "true"
        },
        encoding: "utf8"
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TRACE_LOG_DIR is required/);
    assert.match(result.stderr, /no logs\/trace fallback is allowed/);
  });

  it("resolves default TRACE_LOG_DIR from the workspace .env root with users scope", async () => {
    const fixtureDir = await mkdtemp(path.join(os.tmpdir(), "aigc-trace-env-"));
    const nestedServerDir = path.join(fixtureDir, "apps", "server");
    await mkdir(nestedServerDir, { recursive: true });
    const resolvedFixtureDir = await realpath(fixtureDir);
    await writeFile(
      path.join(fixtureDir, ".env"),
      "TRACE_LOG_DIR=storage/trace\n"
    );

    try {
      const result = spawnSync(
        tsxBin,
        [
          "--eval",
          `import(${JSON.stringify(traceLogModuleUrl)})
            .then(async ({ createFileTraceLogger }) => {
              const logger = createFileTraceLogger({
                traceId: "script_123",
                clock: () => new Date("2026-05-23T12:00:00.000Z")
              });
              await logger.append({
                kind: "session.started",
                pipeline: "creative_blueprint",
                status: "ok"
              });
              console.log(JSON.stringify({
                filePath: logger.filePath,
                traceBatchId: logger.traceBatchId
              }));
            })
            .catch((error) => {
              console.error(error instanceof Error ? error.message : String(error));
              process.exit(1);
            });`
        ],
        {
          cwd: nestedServerDir,
          env: withoutTraceEnv(),
          encoding: "utf8"
        }
      );

      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(result.stdout.trim()) as {
        filePath: string;
        traceBatchId: string;
      };
      const expectedFilePath = path.join(
        resolvedFixtureDir,
        "storage",
        "trace",
        "users",
        parsed.traceBatchId,
        "events.jsonl"
      );
      assert.match(parsed.traceBatchId, /^\d{10}-\d{2}-\d{2}$/);
      assert.equal(parsed.filePath, expectedFilePath);

      const lines = (await readFile(expectedFilePath, "utf8")).trim().split("\n");
      assert.equal(lines.length, 1);
      assert.equal(JSON.parse(lines[0]!).scriptId, "script_123");
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it("uses TRACE_LOG_SCOPE from the environment", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "aigc-trace-scope-"));

    try {
      const result = spawnSync(
        tsxBin,
        [
          "--eval",
          `import(${JSON.stringify(traceLogModuleUrl)})
            .then(({ createFileTraceLogger }) => {
              const logger = createFileTraceLogger({
                traceId: "script_123",
                traceRoot: ${JSON.stringify(traceRoot)}
              });
              console.log(JSON.stringify({
                filePath: logger.filePath,
                traceBatchId: logger.traceBatchId
              }));
            })
            .catch((error) => {
              console.error(error instanceof Error ? error.message : String(error));
              process.exit(1);
            });`
        ],
        {
          env: {
            ...withoutTraceEnv(),
            TRACE_LOG_SCOPE: "tests"
          },
          encoding: "utf8"
        }
      );

      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(result.stdout.trim()) as {
        filePath: string;
        traceBatchId: string;
      };
      assert.equal(
        parsed.filePath,
        path.join(
          traceRoot,
          "tests",
          parsed.traceBatchId,
          "script_123",
          "events.jsonl"
        )
      );
      assert.match(parsed.traceBatchId, /^\d{10}-\d{2}-\d{2}$/);
    } finally {
      await rm(traceRoot, { recursive: true, force: true });
    }
  });

  it("lets options.traceScope override TRACE_LOG_SCOPE", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "aigc-trace-scope-"));

    try {
      const firstLogger = createFileTraceLogger({
        traceId: "script_123",
        traceRoot,
        traceScope: "users"
      });
      const secondLogger = createFileTraceLogger({
        traceId: "script_456",
        traceRoot,
        traceScope: "users"
      });

      assert.equal(firstLogger.traceScope, "users");
      assert.equal(firstLogger.filePath, secondLogger.filePath);
      assert.equal(
        firstLogger.filePath,
        path.join(traceRoot, "users", getDefaultTraceBatchId(), "events.jsonl")
      );

      await firstLogger.append({
        kind: "session.started",
        pipeline: "creative_blueprint",
        status: "ok"
      });
      await secondLogger.append({
        kind: "session.started",
        pipeline: "one_click_video",
        status: "ok"
      });

      const lines = (await readFile(firstLogger.filePath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        lines.map((line) => line.scriptId),
        ["script_123", "script_456"]
      );
    } finally {
      await rm(traceRoot, { recursive: true, force: true });
    }
  });

  it("fails loudly for invalid TRACE_LOG_SCOPE values", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "aigc-trace-scope-"));

    try {
      const result = spawnSync(
        tsxBin,
        [
          "--eval",
          `import(${JSON.stringify(traceLogModuleUrl)})
            .then(({ createFileTraceLogger }) => {
              createFileTraceLogger({
                traceId: "script_123",
                traceRoot: ${JSON.stringify(traceRoot)}
              });
            })
            .catch((error) => {
              console.error(error instanceof Error ? error.message : String(error));
              process.exit(1);
            });`
        ],
        {
          env: {
            ...withoutTraceEnv(),
            TRACE_LOG_SCOPE: "invalid"
          },
          encoding: "utf8"
        }
      );

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /TRACE_LOG_SCOPE must be "users" or "tests"/);
    } finally {
      await rm(traceRoot, { recursive: true, force: true });
    }
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
