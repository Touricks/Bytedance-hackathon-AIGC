import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";
import type { WorkspaceStorageObjectInfo } from "../workspace/storage/workspace-storage.adapter.js";
import { __setWorkspaceStorageAdapterFactoryForTests } from "../workspace/storage/workspace-storage-resolver.js";
import { traceService } from "./trace.service.js";
import {
  providerCallTraceRelativePath,
  recordProviderCallTrace,
} from "./provider-call-trace.js";

const cleanupDirs: string[] = [];
const origModelMode = process.env.MODEL_MODE;

async function withModelMode<T>(
  value: string | undefined,
  fn: () => Promise<T>,
) {
  const previous = process.env.MODEL_MODE;
  if (value === undefined) {
    delete process.env.MODEL_MODE;
  } else {
    process.env.MODEL_MODE = value;
  }
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.MODEL_MODE;
    } else {
      process.env.MODEL_MODE = previous;
    }
  }
}

async function createBoundWorkspace(app: FastifyInstance) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: { name: `trace-mirror-${Date.now()}` },
  });
  assert.equal(createResponse.statusCode, 200, createResponse.body);
  const workspace = createResponse.json().workspace as {
    id: string;
    currentScriptId: string;
  };

  const directory = await mkdtemp(path.join(os.tmpdir(), "trace-mirror-"));
  cleanupDirs.push(directory);
  const bindResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/storage/bind`,
    payload: { kind: "local", localPath: directory },
  });
  assert.equal(bindResponse.statusCode, 200, bindResponse.body);

  return {
    workspaceId: workspace.id,
    currentScriptId: workspace.currentScriptId,
    directory,
  };
}

describe("trace service", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
    __setWorkspaceStorageAdapterFactoryForTests(undefined);
    await Promise.all(
      cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    if (origModelMode === undefined) {
      delete process.env.MODEL_MODE;
    } else {
      process.env.MODEL_MODE = origModelMode;
    }
  });

  it("mirrors shot trace records into the workspace-local trace file", async () => {
    const { workspaceId, currentScriptId, directory } =
      await createBoundWorkspace(app);
    const shotId = `shot_${Date.now()}`;
    await db.db2.insertShot({
      id: shotId,
      workspaceId,
      scriptId: currentScriptId,
      orderIndex: 0,
      title: "Trace mirror shot",
      objective: "Verify shot-level trace mirroring",
      defaultDurationSec: 4,
      status: "DRAFT",
      nextAction: null,
      activeImagePromptArtifactId: null,
      selectedImageId: null,
      activeVideoScriptArtifactId: null,
      selectedVideoId: null,
      lastError: null,
    });

    await traceService.record({
      workspaceId,
      shotId,
      traceType: "agent_run",
      name: "image_prompt_proposed",
      inputPreview: "selected product image",
      outputPreview: "render a clean ecommerce still",
      metadata: {
        promptAssembly: {
          subjectHash: "a".repeat(64),
          contractHash: "b".repeat(64),
        },
      },
    });

    const tracePath = path.join(directory, ".daireel", "trace", "events.jsonl");
    const raw = await readFile(tracePath, "utf8");
    const events = raw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.workspaceId, workspaceId);
    assert.equal(events[0]?.shotId, shotId);
    assert.equal(events[0]?.kind, "image_prompt_proposed");
    assert.equal(events[0]?.pipeline, "shot_image");
    assert.equal(events[0]?.status, "ok");
    assert.deepEqual(
      (events[0]?.meta as Record<string, unknown>)?.promptAssembly,
      {
        subjectHash: "a".repeat(64),
        contractHash: "b".repeat(64),
      },
    );
  });

  it("writes real provider call records into the workspace-local provider trace file", async () => {
    await withModelMode("real", async () => {
      const { workspaceId, directory } = await createBoundWorkspace(app);
      await recordProviderCallTrace({
        workspaceId,
        shotId: "shot-provider-trace",
        jobId: "job-provider-trace",
        attempt: 1,
        maxAttempts: 2,
        batchId: "imb-provider-trace",
        candidateId: "imc-provider-trace",
        candidateIndex: 0,
        mediaType: "image",
        provider: "ark-seedream",
        model: "ep-image",
        status: "succeeded",
        prompt: "render a clean ecommerce product still",
        negativePrompt: "blur",
        requestedCount: 1,
        generatedCount: 1,
        latencyMs: 123,
        aspectRatio: "9:16",
        referenceImageCount: 1,
        referenceImageSources: ["data_url", "workspace_stable"],
        stableUrl: "data:image/png;base64,AAAA",
        providerTemporaryUrl: "https://provider.example/temp.png",
      });

      const tracePath = path.join(directory, providerCallTraceRelativePath);
      const raw = await readFile(tracePath, "utf8");
      const events = raw
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      assert.equal(events.length, 1);
      assert.equal(events[0]?.schemaVersion, "provider-call-trace");
      assert.equal(events[0]?.workspaceId, workspaceId);
      assert.equal(events[0]?.mediaType, "image");
      assert.equal(events[0]?.jobId, "job-provider-trace");
      assert.equal(events[0]?.candidateId, "imc-provider-trace");
      assert.equal(events[0]?.generatedCount, 1);
      assert.deepEqual(events[0]?.referenceImageSources, [
        "data_url",
        "workspace_stable",
      ]);
      assert.match(String(events[0]?.promptHash), /^[a-f0-9]{64}$/);
      assert.equal(
        events[0]?.stableUrl,
        "data:image/<redacted>;base64,<redacted>",
      );
    });
  });

  it("archives trace records as immutable S3 per-event JSON objects", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: `trace-s3-${Date.now()}` },
    });
    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const workspace = createResponse.json().workspace as { id: string };
    await db.bindWorkspaceS3Storage({
      workspaceId: workspace.id,
      bucket: "trace-test",
      prefix: `workspaces/${workspace.id}`,
      region: "test-region",
      endpoint: "https://s3.example.test",
    });

    const writes: Array<{ relativePath: string; body: string }> = [];
    __setWorkspaceStorageAdapterFactoryForTests((binding) => ({
      kind: binding.kind,
      binding,
      async putObject(input) {
        writes.push({
          relativePath: input.relativePath,
          body: String(input.body),
        });
        return {
          relativePath: input.relativePath,
          size: String(input.body).length,
          contentType: input.contentType ?? null,
          lastModified: new Date(),
        } satisfies WorkspaceStorageObjectInfo;
      },
      readObject: async () => Buffer.alloc(0),
      streamObject: async () => {
        throw new Error("not implemented") as never as Readable;
      },
      deleteObject: async () => {},
      listObjects: async () => [],
      statObject: async () => {
        throw new Error("not implemented");
      },
      exists: async () => false,
      downloadToTemp: async () => {},
      deletePrefix: async () => {},
    }));

    await traceService.record({
      workspaceId: workspace.id,
      traceType: "agent_run",
      name: "material_intake.request_prepared",
      inputPreview: "Authorization: Bearer archive-token",
      metadata: {
        apiKey: "secret-api-key",
        imageUrl: "data:image/png;base64,c2Vuc2l0aXZl",
        providerTemporaryUrl: "https://provider.example/temp.png",
      },
    });

    assert.equal(writes.length, 1);
    assert.match(
      writes[0]!.relativePath,
      /^trace\/events\/[^/]+-trc_[a-z0-9]+\.json$/,
    );
    const payload = JSON.parse(writes[0]!.body) as {
      workspaceId?: string;
      meta?: Record<string, unknown>;
    };
    assert.equal(payload.workspaceId, workspace.id);
    assert.equal(payload.meta?.apiKey, "<redacted>");
    assert.equal(
      payload.meta?.imageUrl,
      "data:image/<redacted>;base64,<redacted>",
    );
    assert.equal(payload.meta?.providerTemporaryUrl, "<redacted>");
  });

  it("does not create provider call trace files outside real mode", async () => {
    await withModelMode("mock", async () => {
      const { workspaceId, directory } = await createBoundWorkspace(app);
      await recordProviderCallTrace({
        workspaceId,
        shotId: "shot-provider-trace-mock",
        jobId: "job-provider-trace-mock",
        attempt: 1,
        maxAttempts: 1,
        batchId: "imb-provider-trace-mock",
        candidateId: "imc-provider-trace-mock",
        candidateIndex: 0,
        mediaType: "image",
        provider: "ark-seedream",
        model: "ep-image",
        status: "succeeded",
        prompt: "mock mode should not write",
        requestedCount: 1,
        generatedCount: 1,
        latencyMs: 1,
        aspectRatio: "9:16",
        referenceImageCount: 0,
        stableUrl: "https://local.example/image.png",
        providerTemporaryUrl: "https://provider.example/temp.png",
      });

      let missing = false;
      try {
        await readFile(
          path.join(directory, providerCallTraceRelativePath),
          "utf8",
        );
      } catch (error) {
        missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      }
      assert.equal(missing, true);
    });
  });
});
