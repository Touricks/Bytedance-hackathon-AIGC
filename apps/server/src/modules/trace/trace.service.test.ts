import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";
import { traceService } from "./trace.service.js";
import {
  providerCallTraceRelativePath,
  recordProviderCallTrace,
} from "./provider-call-trace.js";
import { __setWorkspaceStorageAdapterFactoryForTests } from "../workspace/storage/workspace-storage-resolver.js";
import type { WorkspaceStorageAdapter } from "../workspace/storage/workspace-storage.adapter.js";

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

async function createS3BoundWorkspace(app: FastifyInstance) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: { name: `trace-s3-${Date.now()}` },
  });
  assert.equal(createResponse.statusCode, 200, createResponse.body);
  const workspace = createResponse.json().workspace as {
    id: string;
    currentScriptId: string;
  };

  const bindResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/storage/bind`,
    payload: {
      kind: "s3",
      bucket: "trace-test-bucket",
      prefix: `workspaces/${workspace.id}`,
      region: "us-east-1",
      endpoint: "http://localhost:9000",
    },
  });
  assert.equal(bindResponse.statusCode, 200, bindResponse.body);

  return {
    workspaceId: workspace.id,
    currentScriptId: workspace.currentScriptId,
  };
}

type PutObjectInput = Parameters<WorkspaceStorageAdapter["putObject"]>[0];

function installFakeS3TraceAdapter(
  putObjects: Array<{
    relativePath: string;
    body: Uint8Array | string;
    contentType?: string;
  }>,
) {
  __setWorkspaceStorageAdapterFactoryForTests((binding) => ({
    kind: binding.kind,
    binding,
    putObject: async (input: PutObjectInput) => {
      putObjects.push(input);
      return {
        relativePath: input.relativePath,
        size: Buffer.byteLength(input.body),
        contentType: input.contentType ?? null,
        lastModified: new Date(),
      };
    },
    readObject: async () => Buffer.alloc(0),
    streamObject: async () => {
      throw new Error("not used");
    },
    deleteObject: async () => undefined,
    listObjects: async () => [],
    statObject: async () => {
      throw new Error("not used");
    },
    exists: async () => false,
    downloadToTemp: async () => undefined,
    deletePrefix: async () => undefined,
  } as WorkspaceStorageAdapter));
}

describe("trace service", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
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
      assert.equal(events[0]?.schemaVersion, "provider_call.v1");
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

  it("mirrors S3 workspace trace records as per-event JSONL objects", async () => {
    const putObjects: Array<{
      relativePath: string;
      body: Uint8Array | string;
      contentType?: string;
    }> = [];
    installFakeS3TraceAdapter(putObjects);
    try {
      const { workspaceId } = await createS3BoundWorkspace(app);
      await traceService.record({
        workspaceId,
        traceType: "job_event",
        name: "final_compose_completed",
        metadata: { manifestHash: "sha256:" + "a".repeat(64) },
      });

      assert.equal(putObjects.length, 1);
      assert.match(putObjects[0]!.relativePath, /^trace\/events\/.+\.jsonl$/);
      assert.equal(putObjects[0]!.contentType, "application/x-ndjson");
      const event = JSON.parse(String(putObjects[0]!.body).trim()) as Record<
        string,
        unknown
      >;
      assert.equal(event.workspaceId, workspaceId);
      assert.equal(event.kind, "final_compose_completed");
      assert.equal(event.pipeline, "final_compose");
      assert.equal(event.status, "ok");
    } finally {
      __setWorkspaceStorageAdapterFactoryForTests(undefined);
    }
  });

  it("mirrors S3 provider call traces without raw prompts or temporary URLs", async () => {
    await withModelMode("real", async () => {
      const putObjects: Array<{
        relativePath: string;
        body: Uint8Array | string;
        contentType?: string;
      }> = [];
      installFakeS3TraceAdapter(putObjects);
      try {
        const { workspaceId } = await createS3BoundWorkspace(app);
        await recordProviderCallTrace({
          workspaceId,
          shotId: "shot-provider-s3-trace",
          jobId: "job-provider-s3-trace",
          attempt: 1,
          maxAttempts: 1,
          batchId: "imb-provider-s3-trace",
          candidateId: "imc-provider-s3-trace",
          candidateIndex: 0,
          mediaType: "image",
          provider: "ark-seedream",
          model: "ep-image",
          status: "succeeded",
          prompt: "render a sensitive ecommerce prompt",
          negativePrompt: "blur",
          requestedCount: 1,
          generatedCount: 1,
          latencyMs: 123,
          aspectRatio: "9:16",
          referenceImageCount: 1,
          referenceImageSources: ["data_url"],
          stableUrl: "data:image/png;base64,AAAA",
          providerTemporaryUrl: "https://provider.example/temp.png?token=secret",
        });

        assert.equal(putObjects.length, 1);
        assert.match(
          putObjects[0]!.relativePath,
          /^trace\/provider-calls\/.+\.jsonl$/,
        );
        const raw = String(putObjects[0]!.body);
        assert.doesNotMatch(raw, /render a sensitive ecommerce prompt/);
        assert.doesNotMatch(raw, /data:image\/png;base64/);
        assert.doesNotMatch(raw, /temp\.png/);
        assert.doesNotMatch(raw, /token=secret/);
        const event = JSON.parse(raw.trim()) as Record<string, unknown>;
        assert.equal(event.schemaVersion, "provider_call.v1");
        assert.equal(event.workspaceId, workspaceId);
        assert.equal(event.traceType, "provider_call");
        const metadata = event.metadata as Record<string, unknown>;
        assert.match(String(metadata.promptHash), /^[a-f0-9]{64}$/);
        assert.equal(metadata.provider, "ark-seedream");
      } finally {
        __setWorkspaceStorageAdapterFactoryForTests(undefined);
      }
    });
  });
});
