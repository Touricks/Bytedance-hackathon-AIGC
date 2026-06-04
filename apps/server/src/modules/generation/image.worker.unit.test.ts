import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  processGenerateImages,
  __setImageProviderForTests,
  __setAssetUrlResolverForTests,
  __setGeneratedAssetPersisterForTests,
} from "./image.worker.js";
import {
  prepareImageReferenceUrlsForProvider,
  runImageGenerationCandidate,
} from "./direct-generation.js";
import {
  __setProviderCallTraceRecorderForTests,
  type ProviderCallTraceInput,
} from "../trace/provider-call-trace.js";

type ProviderCall = {
  args: unknown;
};

function makeFakeProvider(result: unknown) {
  const calls: ProviderCall[] = [];
  const fn = async (args: unknown) => {
    calls.push({ args });
    return result as any;
  };
  return { fn, calls };
}

function makeFakeDb() {
  const batches = new Map<
    string,
    {
      id: string;
      status: string;
      succeededCount: number;
      failedCount: number;
      shotId: string;
      workspaceId: string;
    }
  >();
  const candidates: any[] = [];
  const candidateRows = new Map<string, any>();
  const shotPatches: any[] = [];
  const jobUpdates: any[] = [];
  const batchUpdates: any[] = [];
  const adapter = {
    getImageBatch: async (id: string) => batches.get(id)!,
    updateImageBatch: async (id: string, patch: any) => {
      const cur = batches.get(id)!;
      Object.assign(cur, patch);
      batchUpdates.push({ id, ...patch });
      return cur;
    },
    getImagePromptArtifact: async () => ({
      id: "art-1",
      promptText: "p",
      negativePrompt: null,
      referenceAssetIds: [],
    }),
    insertImageCandidate: async (input: any) => {
      const row = { ...input, createdAt: new Date().toISOString() };
      candidates.push(row);
      candidateRows.set(row.id, row);
      return row;
    },
    getImageCandidate: async (id: string) => candidateRows.get(id),
    updateImageCandidate: async (id: string, patch: any) => {
      const row = candidateRows.get(id)!;
      Object.assign(row, patch);
      return row;
    },
    updateGenerationJob: async (id: string, patch: any) => {
      jobUpdates.push({ id, ...patch });
      return { id, ...patch } as any;
    },
    updateShot: async (shotId: string, patch: any) => {
      shotPatches.push({ shotId, ...patch });
      return { id: shotId } as any;
    },
    pool: () => ({
      connect: async () => ({
        query: async () => ({ rows: [] }),
        release: () => {},
      }),
    }),
  };

  async function bootstrap(status: string) {
    const batchId = "batch-1";
    batches.set(batchId, {
      id: batchId,
      status,
      succeededCount: 0,
      failedCount: 0,
      shotId: "shot-1",
      workspaceId: "ws-1",
    });
    return {
      batchId,
      jobData: {
        kind: "generate_images" as const,
        jobId: "job-1",
        batchId,
        shotId: "shot-1",
        workspaceId: "ws-1",
        imagePromptArtifactId: "art-1",
        count: 3,
        aspectRatio: "9:16" as const,
        traceId: "trace-1",
      },
    };
  }
  return { adapter, batches, candidates, candidateRows, shotPatches, jobUpdates, batchUpdates, bootstrap };
}

// Trace service writes to Postgres. For unit tests, replace it with a no-op
// by setting an env hint OR by mocking via the global db (we mock that via adapter).
// Since trace.service uses traceRepository which goes through db.db2 (the REAL db.db2),
// we need to intercept that. The simplest: do not allow trace.service to actually write
// by setting an env var that traceService reads. For now, traceService.record calls
// db.db2.insertTraceEvent — which connects to the real DB. In unit tests we can't reach
// pg. So we stub by replacing the global traceService.record? The plan accepts traceService
// will throw; we catch and assert behavior. Instead, we mock db.db2 globally by injecting
// traceService no-op via process env. The cleanest fix: monkeypatch traceService.record.

import { traceService } from "../trace/trace.service.js";
import { jobRepository } from "../job/job.repository.js";

const origRecord = traceService.record;
const origJobUpdate = jobRepository.update;
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
    __setProviderCallTraceRecorderForTests(undefined);
  }
}

describe("processGenerateImages", () => {
  before(() => {
    // Stub trace + jobRepository.update so they do not hit Postgres
    traceService.record = async () => undefined;
    jobRepository.update = (async () => ({})) as any;
  });
  after(() => {
    traceService.record = origRecord;
    jobRepository.update = origJobUpdate;
    __setImageProviderForTests(undefined);
    __setAssetUrlResolverForTests(undefined);
    __setGeneratedAssetPersisterForTests(undefined);
    __setProviderCallTraceRecorderForTests(undefined);
    if (origModelMode === undefined) {
      delete process.env.MODEL_MODE;
    } else {
      process.env.MODEL_MODE = origModelMode;
    }
  });

  afterEach(() => {
    __setImageProviderForTests(undefined);
    __setAssetUrlResolverForTests(undefined);
    __setGeneratedAssetPersisterForTests(undefined);
    __setProviderCallTraceRecorderForTests(undefined);
  });

  it("creates candidates, updates batch to SUCCEEDED, transitions shot", async () => {
    const fakeProvider = makeFakeProvider({
      provider: "ark-seedream",
      model: "test-model",
      candidates: [{ imageUrl: "u1" }, { imageUrl: "u2" }, { imageUrl: "u3" }],
    });
    __setImageProviderForTests(fakeProvider.fn);
    __setGeneratedAssetPersisterForTests(async (input) => ({
      stableUrl: `/api/workspaces/${input.workspaceId}/materials/generated-images/${input.candidateId}.png`,
      objectKey: `materials/generated-images/${input.candidateId}.png`,
      providerTemporaryUrl: input.sourceUrl,
    }));

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("PENDING");
    await processGenerateImages(ctx.jobData, fakeDb.adapter as any);
    assert.equal(fakeDb.batches.get(ctx.batchId)?.status, "SUCCEEDED");
    assert.equal(fakeDb.candidates.length, 3);
    assert.equal(fakeDb.shotPatches.at(-1)?.status, "IMAGE_CANDIDATES_READY");
  });

  it("returns early if batch is not PENDING (idempotent)", async () => {
    const fakeProvider = makeFakeProvider({
      provider: "ark-seedream",
      model: "test-model",
      candidates: [],
    });
    __setImageProviderForTests(fakeProvider.fn);
    __setGeneratedAssetPersisterForTests(async (input) => ({
      stableUrl: input.sourceUrl,
      objectKey: null,
      providerTemporaryUrl: null,
    }));
    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("SUCCEEDED");
    await processGenerateImages(ctx.jobData, fakeDb.adapter as any);
    assert.equal(fakeProvider.calls.length, 0);
  });

  it("passes resolved reference image URLs to the provider", async () => {
    const seenArgs: unknown[] = [];
    const seenResolverIds: string[][] = [];
    __setImageProviderForTests(async (args) => {
      seenArgs.push(args);
      return { provider: "ark-seedream", model: "test", candidates: [{ imageUrl: "u" }], candidateErrors: [] };
    });
    __setGeneratedAssetPersisterForTests(async (input) => ({
      stableUrl: input.sourceUrl,
      objectKey: null,
      providerTemporaryUrl: null,
    }));
    __setAssetUrlResolverForTests(async (ids) => {
      seenResolverIds.push(ids);
      return ["https://r/1.png", "https://r/2.png"];
    });

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("PENDING");
    await processGenerateImages(
      { ...ctx.jobData, count: 1 },
      {
        ...fakeDb.adapter as any,
        getImagePromptArtifact: async () => ({
          id: "art-1", promptText: "p", negativePrompt: null, referenceAssetIds: ["a1", "a2"],
        }),
      } as any,
    );
    assert.deepEqual((seenArgs[0] as any).referenceImageUrls, ["https://r/1.png", "https://r/2.png"]);
    assert.deepEqual(seenResolverIds[0], ["a1", "a2"]);
  });

  it("converts generated workspace image references to data URLs and records source classes", async () => {
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "daireel-ref-"));
    const generatedDir = path.join(
      workspaceDir,
      ".daireel",
      "materials",
      "generated-images",
    );
    await mkdir(generatedDir, { recursive: true });
    await writeFile(path.join(generatedDir, "imc-old.png"), Buffer.from("old-png"));

    const prepared = await prepareImageReferenceUrlsForProvider({
      workspaceId: "ws-1",
      urls: [
        "/api/workspaces/ws-1/materials/generated-images/imc-old.png",
        "https://cdn.example/public.png",
        "data:image/png;base64,AAAA",
      ],
      resolveWorkspaceLocalPath: async () => workspaceDir,
    });

    assert.equal(
      prepared.urls[0],
      `data:image/png;base64,${Buffer.from("old-png").toString("base64")}`,
    );
    assert.deepEqual(prepared.sources, [
      "workspace_stable",
      "public_https",
      "data_url",
    ]);
  });

  it("generates one queued image candidate with a single-image provider request", async () => {
    const seenArgs: unknown[] = [];
    __setImageProviderForTests(async (args) => {
      seenArgs.push(args);
      return {
        provider: "ark-seedream",
        model: "test",
        candidates: [{ imageUrl: "https://provider/image.jpg" }],
        candidateErrors: [],
      };
    });
    __setGeneratedAssetPersisterForTests(async (input) => ({
      stableUrl: `/api/workspaces/${input.workspaceId}/materials/generated-images/${input.candidateId}.jpg`,
      objectKey: `materials/generated-images/${input.candidateId}.jpg`,
      providerTemporaryUrl: input.sourceUrl,
    }));

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("RUNNING");
    await fakeDb.adapter.insertImageCandidate({
      id: "imc-1",
      batchId: ctx.batchId,
      workspaceId: "ws-1",
      shotId: "shot-1",
      imageUrl: null,
      objectKey: null,
      width: null,
      height: null,
      seed: null,
      provider: "ark-seedream",
      providerResponse: { candidateIndex: 0 },
      status: "PENDING",
      errorMessage: null,
    });

    const result = await runImageGenerationCandidate(
      {
        batchId: ctx.batchId,
        candidateId: "imc-1",
        aspectRatio: "9:16",
        adapter: fakeDb.adapter as any,
      },
    );

    assert.equal((seenArgs[0] as any).count, 1);
    assert.equal(result.candidate.status, "SUCCEEDED");
    assert.equal(
      result.candidate.imageUrl,
      "/api/workspaces/ws-1/materials/generated-images/imc-1.jpg",
    );
  });

  it("records provider call trace for a successful queued image candidate in real mode", async () => {
    await withModelMode("real", async () => {
      const traces: ProviderCallTraceInput[] = [];
      __setProviderCallTraceRecorderForTests(async (input) => {
        traces.push(input);
      });
      __setImageProviderForTests(async () => ({
        provider: "ark-seedream",
        model: "ep-image",
        candidates: [{ imageUrl: "https://provider/image.jpg" }],
        candidateErrors: [],
      }));
      __setGeneratedAssetPersisterForTests(async (input) => ({
        stableUrl: `/api/workspaces/${input.workspaceId}/materials/generated-images/${input.candidateId}.jpg`,
        objectKey: `materials/generated-images/${input.candidateId}.jpg`,
        providerTemporaryUrl: input.sourceUrl,
      }));

      const fakeDb = makeFakeDb();
      const ctx = await fakeDb.bootstrap("RUNNING");
      await fakeDb.adapter.insertImageCandidate({
        id: "imc-trace",
        batchId: ctx.batchId,
        workspaceId: "ws-1",
        shotId: "shot-1",
        imageUrl: null,
        objectKey: null,
        width: null,
        height: null,
        seed: null,
        provider: "ark-seedream",
        providerResponse: { candidateIndex: 0 },
        status: "PENDING",
        errorMessage: null,
      });

      await runImageGenerationCandidate({
        batchId: ctx.batchId,
        candidateId: "imc-trace",
        aspectRatio: "9:16",
        referenceImageUrls: [
          "data:image/png;base64,AAAA",
          "https://provider.example/ref.png",
        ],
        providerTrace: {
          workspaceId: "ws-1",
          shotId: "shot-1",
          jobId: "job-image-trace",
          attempt: 2,
          maxAttempts: 3,
          candidateIndex: 0,
        },
        adapter: fakeDb.adapter as any,
      });

      assert.equal(traces.length, 1);
      assert.equal(traces[0]?.mediaType, "image");
      assert.equal(traces[0]?.status, "succeeded");
      assert.equal(traces[0]?.jobId, "job-image-trace");
      assert.equal(traces[0]?.attempt, 2);
      assert.equal(traces[0]?.maxAttempts, 3);
      assert.equal(traces[0]?.candidateId, "imc-trace");
      assert.equal(traces[0]?.candidateIndex, 0);
      assert.equal(traces[0]?.prompt, "p");
      assert.equal(traces[0]?.generatedCount, 1);
      assert.deepEqual(traces[0]?.referenceImageSources, [
        "data_url",
        "https_provider_tos",
      ]);
      assert.equal(
        traces[0]?.stableUrl,
        "/api/workspaces/ws-1/materials/generated-images/imc-trace.jpg",
      );
      assert.equal(
        traces[0]?.providerTemporaryUrl,
        "https://provider/image.jpg",
      );
    });
  });

  it("records provider call trace for a failed queued image candidate in real mode", async () => {
    await withModelMode("real", async () => {
      const traces: ProviderCallTraceInput[] = [];
      __setProviderCallTraceRecorderForTests(async (input) => {
        traces.push(input);
      });
      __setImageProviderForTests(async () => {
        throw new Error("temporary provider limit");
      });

      const fakeDb = makeFakeDb();
      const ctx = await fakeDb.bootstrap("RUNNING");
      await fakeDb.adapter.insertImageCandidate({
        id: "imc-trace-fail",
        batchId: ctx.batchId,
        workspaceId: "ws-1",
        shotId: "shot-1",
        imageUrl: null,
        objectKey: null,
        width: null,
        height: null,
        seed: null,
        provider: "ark-seedream",
        providerResponse: { candidateIndex: 0 },
        status: "PENDING",
        errorMessage: null,
      });

      await assert.rejects(
        runImageGenerationCandidate({
          batchId: ctx.batchId,
          candidateId: "imc-trace-fail",
          aspectRatio: "9:16",
          providerTrace: {
            workspaceId: "ws-1",
            shotId: "shot-1",
            jobId: "job-image-fail",
            attempt: 1,
            maxAttempts: 2,
            candidateIndex: 0,
          },
          adapter: fakeDb.adapter as any,
        }),
        /temporary provider limit/,
      );

      assert.equal(traces.length, 1);
      assert.equal(traces[0]?.mediaType, "image");
      assert.equal(traces[0]?.status, "failed");
      assert.equal(traces[0]?.generatedCount, 0);
      assert.equal(traces[0]?.error, "temporary provider limit");
      assert.equal(traces[0]?.jobId, "job-image-fail");
    });
  });

  it("does not record provider call trace outside real mode", async () => {
    await withModelMode("mock", async () => {
      const traces: ProviderCallTraceInput[] = [];
      __setProviderCallTraceRecorderForTests(async (input) => {
        traces.push(input);
      });
      __setImageProviderForTests(async () => ({
        provider: "ark-seedream",
        model: "ep-image",
        candidates: [{ imageUrl: "https://provider/image.jpg" }],
        candidateErrors: [],
      }));
      __setGeneratedAssetPersisterForTests(async (input) => ({
        stableUrl: input.sourceUrl,
        objectKey: null,
        providerTemporaryUrl: input.sourceUrl,
      }));

      const fakeDb = makeFakeDb();
      const ctx = await fakeDb.bootstrap("RUNNING");
      await fakeDb.adapter.insertImageCandidate({
        id: "imc-mock-trace",
        batchId: ctx.batchId,
        workspaceId: "ws-1",
        shotId: "shot-1",
        imageUrl: null,
        objectKey: null,
        width: null,
        height: null,
        seed: null,
        provider: "ark-seedream",
        providerResponse: { candidateIndex: 0 },
        status: "PENDING",
        errorMessage: null,
      });

      await runImageGenerationCandidate({
        batchId: ctx.batchId,
        candidateId: "imc-mock-trace",
        aspectRatio: "9:16",
        providerTrace: {
          workspaceId: "ws-1",
          shotId: "shot-1",
          jobId: "job-image-mock",
          attempt: 1,
          maxAttempts: 1,
          candidateIndex: 0,
        },
        adapter: fakeDb.adapter as any,
      });

      assert.equal(traces.length, 0);
    });
  });

  it("does not fail image generation when provider call trace append fails", async () => {
    await withModelMode("real", async () => {
      __setProviderCallTraceRecorderForTests(async () => {
        throw new Error("disk full");
      });
      __setImageProviderForTests(async () => ({
        provider: "ark-seedream",
        model: "ep-image",
        candidates: [{ imageUrl: "https://provider/image.jpg" }],
        candidateErrors: [],
      }));
      __setGeneratedAssetPersisterForTests(async (input) => ({
        stableUrl: `/api/workspaces/${input.workspaceId}/materials/generated-images/${input.candidateId}.jpg`,
        objectKey: null,
        providerTemporaryUrl: input.sourceUrl,
      }));

      const fakeDb = makeFakeDb();
      const ctx = await fakeDb.bootstrap("RUNNING");
      await fakeDb.adapter.insertImageCandidate({
        id: "imc-trace-append-fail",
        batchId: ctx.batchId,
        workspaceId: "ws-1",
        shotId: "shot-1",
        imageUrl: null,
        objectKey: null,
        width: null,
        height: null,
        seed: null,
        provider: "ark-seedream",
        providerResponse: { candidateIndex: 0 },
        status: "PENDING",
        errorMessage: null,
      });

      const result = await runImageGenerationCandidate({
        batchId: ctx.batchId,
        candidateId: "imc-trace-append-fail",
        aspectRatio: "9:16",
        providerTrace: {
          workspaceId: "ws-1",
          shotId: "shot-1",
          jobId: "job-image-append-fail",
          attempt: 1,
          maxAttempts: 1,
          candidateIndex: 0,
        },
        adapter: fakeDb.adapter as any,
      });

      assert.equal(result.candidate.status, "SUCCEEDED");
    });
  });

  it("leaves a candidate retryable before the final queue attempt", async () => {
    __setImageProviderForTests(async () => {
      throw new Error("temporary provider limit");
    });

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("RUNNING");
    await fakeDb.adapter.insertImageCandidate({
      id: "imc-retry",
      batchId: ctx.batchId,
      workspaceId: "ws-1",
      shotId: "shot-1",
      imageUrl: null,
      objectKey: null,
      width: null,
      height: null,
      seed: null,
      provider: "ark-seedream",
      providerResponse: { candidateIndex: 0 },
      status: "PENDING",
      errorMessage: null,
    });

    await assert.rejects(
      runImageGenerationCandidate({
        batchId: ctx.batchId,
        candidateId: "imc-retry",
        aspectRatio: "9:16",
        failCandidateOnError: false,
        adapter: fakeDb.adapter as any,
      }),
      /temporary provider limit/,
    );

    const retryable = fakeDb.candidateRows.get("imc-retry");
    assert.equal(retryable.status, "RUNNING");
    assert.equal(retryable.errorMessage, null);
  });
});
