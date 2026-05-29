/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  processGenerateImages,
  __setImageProviderForTests,
  __setAssetUrlResolverForTests,
} from "./image.worker.js";

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
      candidates.push(input);
      return { ...input, id: "cand-" + candidates.length, createdAt: new Date().toISOString() };
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
  return { adapter, batches, candidates, shotPatches, jobUpdates, batchUpdates, bootstrap };
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
  });

  it("creates candidates, updates batch to SUCCEEDED, transitions shot", async () => {
    const fakeProvider = makeFakeProvider({
      provider: "ark-seedream",
      model: "test-model",
      candidates: [{ imageUrl: "u1" }, { imageUrl: "u2" }, { imageUrl: "u3" }],
    });
    __setImageProviderForTests(fakeProvider.fn);

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
});
