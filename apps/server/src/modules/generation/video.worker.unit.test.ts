/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  processGenerateVideos,
  processGenerateVideoCandidate,
  __setGeneratedAssetPersisterForTests,
  __setVideoProviderForTests,
} from "./video.worker.js";
import { runVideoGenerationCandidate } from "./direct-generation.js";
import { traceService } from "../trace/trace.service.js";
import { jobRepository } from "../job/job.repository.js";
import {
  __setProviderCallTraceRecorderForTests,
  type ProviderCallTraceInput,
} from "../trace/provider-call-trace.js";

function makeFakeProvider(result: any) {
  const calls: any[] = [];
  const fn = async (args: any) => {
    calls.push(args);
    return result;
  };
  return { fn, calls };
}

function makeFakeDb() {
  const batches = new Map<string, any>();
  const videoCandidates: any[] = [];
  const videoCandidateRows = new Map<string, any>();
  const shotPatches: any[] = [];
  const adapter = {
    getVideoBatch: async (id: string) => batches.get(id)!,
    updateVideoBatch: async (id: string, patch: any) => {
      Object.assign(batches.get(id)!, patch);
      return batches.get(id)!;
    },
    getVideoScriptArtifact: async () => ({
      id: "art-vid-1",
      status: "ACTIVE",
      durationSec: 4,
      scriptJson: { voiceover: "整理桌面，从一盏好灯开始。" },
      providerPrompt: "镜头从已选择的商品首帧开始，缓慢推进展示桌面灯具，保持产品形状和光线稳定。",
      basedOnImageCandidateId: "imc-1",
      basedOnNextImageCandidateId: "imc-2",
    }),
    getImageCandidate: async (id: string) =>
      id === "imc-2"
        ? {
            id: "imc-2",
            imageUrl: "https://cdn.example/img-2.png",
          }
        : {
            id: "imc-1",
            imageUrl: "https://cdn.example/img-1.png",
          },
    insertVideoCandidate: async (input: any) => {
      const row = {
        ...input,
        id: input.id ?? "vcd-" + (videoCandidates.length + 1),
        createdAt: new Date().toISOString(),
      };
      videoCandidates.push(row);
      videoCandidateRows.set(row.id, row);
      return row;
    },
    getVideoCandidate: async (id: string) => videoCandidateRows.get(id),
    updateVideoCandidate: async (id: string, patch: any) => {
      const row = videoCandidateRows.get(id)!;
      Object.assign(row, patch);
      return row;
    },
    updateShot: async (shotId: string, patch: any) => {
      shotPatches.push({ shotId, ...patch });
      return { id: shotId } as any;
    },
    pool: () => ({
      connect: async () => ({
        query: async (sql: string, params: any[] = []) => {
          if (/^(begin|commit|rollback)$/i.test(sql.trim())) return { rows: [] };
          if (sql.includes("select requested_count")) {
            const batch = batches.get(params[0])!;
            return { rows: [{ requested_count: batch.requestedCount ?? 1 }] };
          }
          if (sql.includes("select status, count")) {
            const batchId = params[0];
            const counts = new Map<string, number>();
            for (const row of videoCandidateRows.values()) {
              if (row.batchId !== batchId) continue;
              counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
            }
            return {
              rows: [...counts.entries()].map(([status, count]) => ({
                status,
                count,
              })),
            };
          }
          if (sql.includes("update video_generation_batches")) {
            const [batchId, status, succeededCount, failedCount] = params;
            const batch = batches.get(batchId)!;
            Object.assign(batch, { status, succeededCount, failedCount });
            return { rows: [batch] };
          }
          if (sql.includes("update storyboard_shots")) {
            const [shotId, status, lastError] = params;
            shotPatches.push({ shotId, status, lastError });
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {},
      }),
    }),
  };
  async function bootstrap(status: string) {
    const batchId = "vbb-1";
    batches.set(batchId, {
      id: batchId,
      status,
      succeededCount: 0,
      failedCount: 0,
      requestedCount: 1,
      shotId: "shot-1",
      workspaceId: "ws-1",
    });
    return {
      batchId,
      jobData: {
        kind: "generate_videos" as const,
        jobId: "job-v-1",
        batchId,
        shotId: "shot-1",
        workspaceId: "ws-1",
        videoScriptArtifactId: "art-vid-1",
        count: 2,
        aspectRatio: "9:16" as const,
        traceId: "trace-v-1",
      },
    };
  }
  return {
    adapter,
    batches,
    videoCandidates,
    videoCandidateRows,
    shotPatches,
    bootstrap,
  };
}

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

describe("processGenerateVideos", () => {
  before(() => {
    traceService.record = async () => undefined;
    jobRepository.update = (async () => ({})) as any;
  });
  after(() => {
    traceService.record = origRecord;
    jobRepository.update = origJobUpdate;
    __setVideoProviderForTests(undefined);
    __setGeneratedAssetPersisterForTests(undefined);
    __setProviderCallTraceRecorderForTests(undefined);
    if (origModelMode === undefined) {
      delete process.env.MODEL_MODE;
    } else {
      process.env.MODEL_MODE = origModelMode;
    }
  });

  it("creates candidates, marks SUCCEEDED on all-fulfilled, transitions shot to VIDEO_CANDIDATES_READY", async () => {
    const fake = makeFakeProvider({
      videoUrl: "https://cdn.example/v.mp4",
      provider: "seedance",
      model: "ep-video",
      prompt: "p",
    });
    __setVideoProviderForTests(fake.fn);
    __setGeneratedAssetPersisterForTests(async (input) => ({
      stableUrl: `/api/workspaces/${input.workspaceId}/videos/${input.candidateId}.mp4`,
      objectKey: `videos/${input.candidateId}.mp4`,
      providerTemporaryUrl: input.sourceUrl,
    }));

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("PENDING");
    await processGenerateVideos(ctx.jobData, fakeDb.adapter as any);
    assert.equal(fakeDb.batches.get(ctx.batchId)?.status, "SUCCEEDED");
    assert.equal(fakeDb.videoCandidates.length, 2);
    assert.equal(fakeDb.shotPatches.at(-1)?.status, "VIDEO_CANDIDATES_READY");
    assert.equal(fake.calls[0]?.lastFrameUrl, "https://cdn.example/img-2.png");
    assert.equal(fake.calls[0]?.generateAudio, true);
    assert.match(fake.calls[0]?.prompt, /音频\/旁白要求/);
    assert.match(fake.calls[0]?.prompt, /本片所有镜头必须使用同一个旁白说话人/);
    assert.match(fake.calls[0]?.prompt, /自然清晰普通话/);
    assert.match(fake.calls[0]?.prompt, /整理桌面，从一盏好灯开始。/);
    assert.match(fake.calls[0]?.prompt, /禁止将口播文案、旁白文字或其改写复制、叠加、渲染到视频画面内/);
    assert.doesNotMatch(fake.calls[0]?.prompt, /不要在画面里生成字幕、标题或任何可读文字/);
  });

  it("returns early if batch is not PENDING (idempotent)", async () => {
    const fake = makeFakeProvider({
      videoUrl: "https://cdn.example/v.mp4",
      provider: "seedance",
      model: "ep-video",
      prompt: "p",
    });
    __setVideoProviderForTests(fake.fn);
    __setGeneratedAssetPersisterForTests(async (input) => ({
      stableUrl: input.sourceUrl,
      objectKey: null,
      providerTemporaryUrl: null,
    }));
    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("SUCCEEDED");
    await processGenerateVideos(ctx.jobData, fakeDb.adapter as any);
    assert.equal(fake.calls.length, 0);
  });

  it("records provider call trace for a successful queued video candidate in real mode", async () => {
    await withModelMode("real", async () => {
      const traces: ProviderCallTraceInput[] = [];
      __setProviderCallTraceRecorderForTests(async (input) => {
        traces.push(input);
      });
      __setVideoProviderForTests(async (args) => ({
        videoUrl: "https://provider/video.mp4",
        provider: "seedance",
        model: "ep-video",
        prompt: args.prompt,
        taskId: "seedance-task-123",
        createdAt: 1,
      }));
      __setGeneratedAssetPersisterForTests(async (input) => ({
        stableUrl: `/api/workspaces/${input.workspaceId}/videos/${input.candidateId}.mp4`,
        objectKey: `videos/${input.candidateId}.mp4`,
        providerTemporaryUrl: input.sourceUrl,
      }));

      const fakeDb = makeFakeDb();
      const ctx = await fakeDb.bootstrap("RUNNING");
      await fakeDb.adapter.insertVideoCandidate({
        id: "vcd-trace",
        batchId: ctx.batchId,
        workspaceId: "ws-1",
        shotId: "shot-1",
        videoUrl: null,
        objectKey: null,
        thumbnailUrl: null,
        durationSec: null,
        width: null,
        height: null,
        provider: "seedance",
        providerResponse: { candidateIndex: 0 },
        status: "PENDING",
        errorMessage: null,
      });

      await runVideoGenerationCandidate({
        batchId: ctx.batchId,
        candidateId: "vcd-trace",
        aspectRatio: "9:16",
        providerTrace: {
          workspaceId: "ws-1",
          shotId: "shot-1",
          jobId: "job-video-trace",
          attempt: 1,
          maxAttempts: 2,
          candidateIndex: 0,
        },
        adapter: fakeDb.adapter as any,
      });

      assert.equal(traces.length, 1);
      assert.equal(traces[0]?.mediaType, "video");
      assert.equal(traces[0]?.status, "succeeded");
      assert.equal(traces[0]?.jobId, "job-video-trace");
      assert.equal(traces[0]?.candidateId, "vcd-trace");
      assert.equal(traces[0]?.generatedCount, 1);
      assert.equal(traces[0]?.providerTaskId, "seedance-task-123");
      assert.equal(traces[0]?.firstFrameUrl, "https://cdn.example/img-1.png");
      assert.equal(traces[0]?.lastFrameUrl, "https://cdn.example/img-2.png");
      assert.equal(traces[0]?.generateAudio, true);
      assert.equal(traces[0]?.stableUrl, null);
      assert.equal(
        traces[0]?.providerTemporaryUrl,
        "https://provider/video.mp4",
      );
    });
  });

  it("marks a provider-ready video candidate as PERSISTING while saving the stable file", async () => {
    __setVideoProviderForTests(async (args) => ({
      videoUrl: "https://provider/video-ready.mp4",
      provider: "seedance",
      model: "ep-video",
      prompt: args.prompt,
      taskId: "seedance-task-ready",
      createdAt: 123,
    }));
    let releasePersist!: () => void;
    const persistCanFinish = new Promise<void>((resolve) => {
      releasePersist = resolve;
    });
    let persistStarted!: () => void;
    const persistStartedPromise = new Promise<void>((resolve) => {
      persistStarted = resolve;
    });
    __setGeneratedAssetPersisterForTests(async (input) => {
      persistStarted();
      await persistCanFinish;
      return {
        stableUrl: `/api/workspaces/${input.workspaceId}/videos/${input.candidateId}.mp4`,
        objectKey: `videos/${input.candidateId}.mp4`,
        providerTemporaryUrl: input.sourceUrl,
      };
    });

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("RUNNING");
    await fakeDb.adapter.insertVideoCandidate({
      id: "vcd-persisting",
      batchId: ctx.batchId,
      workspaceId: "ws-1",
      shotId: "shot-1",
      videoUrl: null,
      objectKey: null,
      thumbnailUrl: null,
      durationSec: null,
      width: null,
      height: null,
      provider: "seedance",
      providerResponse: { candidateIndex: 0 },
      status: "PENDING",
      errorMessage: null,
    });

    const runPromise = runVideoGenerationCandidate({
      batchId: ctx.batchId,
      candidateId: "vcd-persisting",
      aspectRatio: "9:16",
      providerTrace: {
        workspaceId: "ws-1",
        shotId: "shot-1",
        jobId: "job-video-persisting",
        attempt: 1,
        maxAttempts: 2,
        candidateIndex: 0,
      },
      adapter: fakeDb.adapter as any,
    });
    await persistStartedPromise;

    const previewable = fakeDb.videoCandidateRows.get("vcd-persisting");
    assert.equal(previewable.status, "PERSISTING");
    assert.equal(previewable.videoUrl, null);
    assert.equal(
      previewable.providerResponse.providerTemporaryUrl,
      "https://provider/video-ready.mp4",
    );
    assert.equal(previewable.providerResponse.taskId, "seedance-task-ready");

    releasePersist();
    const result = await runPromise;
    assert.equal(result.candidate.status, "SUCCEEDED");
    assert.equal(
      result.candidate.videoUrl,
      "/api/workspaces/ws-1/videos/vcd-persisting.mp4",
    );
  });

  it("records provider success and asset persist start before stable save finishes", async () => {
    await withModelMode("real", async () => {
      const providerCalls: ProviderCallTraceInput[] = [];
      const traceEvents: any[] = [];
      __setProviderCallTraceRecorderForTests(async (input) => {
        providerCalls.push(input);
      });
      traceService.record = (async (input: any) => {
        traceEvents.push(input);
      }) as any;
      __setVideoProviderForTests(async (args) => ({
        videoUrl: "https://provider/video-ready.mp4",
        provider: "seedance",
        model: "ep-video",
        prompt: args.prompt,
        taskId: "seedance-task-ready",
        createdAt: 123,
      }));
      let releasePersist!: () => void;
      const persistCanFinish = new Promise<void>((resolve) => {
        releasePersist = resolve;
      });
      let persistStarted!: () => void;
      const persistStartedPromise = new Promise<void>((resolve) => {
        persistStarted = resolve;
      });
      __setGeneratedAssetPersisterForTests(async (input) => {
        persistStarted();
        await persistCanFinish;
        return {
          stableUrl: `/api/workspaces/${input.workspaceId}/videos/${input.candidateId}.mp4`,
          objectKey: `videos/${input.candidateId}.mp4`,
          providerTemporaryUrl: input.sourceUrl,
        };
      });

      const fakeDb = makeFakeDb();
      const ctx = await fakeDb.bootstrap("RUNNING");
      await fakeDb.adapter.insertVideoCandidate({
        id: "vcd-trace-persist",
        batchId: ctx.batchId,
        workspaceId: "ws-1",
        shotId: "shot-1",
        videoUrl: null,
        objectKey: null,
        thumbnailUrl: null,
        durationSec: null,
        width: null,
        height: null,
        provider: "seedance",
        providerResponse: { candidateIndex: 0 },
        status: "PENDING",
        errorMessage: null,
      });

      const runPromise = runVideoGenerationCandidate({
        batchId: ctx.batchId,
        candidateId: "vcd-trace-persist",
        aspectRatio: "9:16",
        providerTrace: {
          workspaceId: "ws-1",
          shotId: "shot-1",
          jobId: "job-video-trace-persist",
          attempt: 1,
          maxAttempts: 2,
          candidateIndex: 0,
        },
        adapter: fakeDb.adapter as any,
      });
      await persistStartedPromise;

      assert.equal(providerCalls.length, 1);
      assert.equal(providerCalls[0]?.status, "succeeded");
      assert.equal(providerCalls[0]?.stableUrl, null);
      assert.equal(
        providerCalls[0]?.providerTemporaryUrl,
        "https://provider/video-ready.mp4",
      );
      assert.equal(providerCalls[0]?.providerTaskId, "seedance-task-ready");
      assert.equal(
        traceEvents.some((event) => event.name === "asset_persist_started"),
        true,
      );

      releasePersist();
      await runPromise;
      assert.equal(
        traceEvents.some((event) => event.name === "asset_persist_completed"),
        true,
      );
      traceService.record = (async () => undefined) as any;
    });
  });

  it("resumes persisting an existing provider-ready candidate without a new provider call", async () => {
    const fake = makeFakeProvider({
      videoUrl: "https://provider/should-not-be-called.mp4",
      provider: "seedance",
      model: "ep-video",
      prompt: "unused",
      taskId: "unused-task",
      createdAt: 1,
    });
    __setVideoProviderForTests(fake.fn);
    __setGeneratedAssetPersisterForTests(async (input) => ({
      stableUrl: `/api/workspaces/${input.workspaceId}/videos/${input.candidateId}.mp4`,
      objectKey: `videos/${input.candidateId}.mp4`,
      providerTemporaryUrl: input.sourceUrl,
    }));

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("RUNNING");
    await fakeDb.adapter.insertVideoCandidate({
      id: "vcd-resume-persist",
      batchId: ctx.batchId,
      workspaceId: "ws-1",
      shotId: "shot-1",
      videoUrl: null,
      objectKey: null,
      thumbnailUrl: null,
      durationSec: 4,
      width: null,
      height: null,
      provider: "seedance",
      providerResponse: {
        provider: "seedance",
        model: "ep-video",
        prompt: "provider-ready prompt",
        taskId: "seedance-task-resume",
        videoUrl: "https://provider/video-ready.mp4",
        providerTemporaryUrl: "https://provider/video-ready.mp4",
        providerReadyAt: "2026-06-03T10:40:00.000Z",
      },
      status: "PERSISTING",
      errorMessage: null,
    });

    const result = await runVideoGenerationCandidate({
      batchId: ctx.batchId,
      candidateId: "vcd-resume-persist",
      aspectRatio: "9:16",
      providerTrace: {
        workspaceId: "ws-1",
        shotId: "shot-1",
        jobId: "job-video-resume-persist",
        attempt: 2,
        maxAttempts: 3,
        candidateIndex: 0,
      },
      adapter: fakeDb.adapter as any,
    });

    assert.equal(fake.calls.length, 0);
    assert.equal(result.candidate.status, "SUCCEEDED");
    assert.equal(
      result.candidate.videoUrl,
      "/api/workspaces/ws-1/videos/vcd-resume-persist.mp4",
    );
  });

  it("leaves a video candidate retryable before the final queue attempt on provider rate limit", async () => {
    __setVideoProviderForTests(async () => {
      throw new Error(
        "Seedance request failed with status 429: EndpointAccountRpmRateLimitExceeded | rpm exceeded",
      );
    });

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("RUNNING");
    await fakeDb.adapter.insertVideoCandidate({
      id: "vcd-rate-limit",
      batchId: ctx.batchId,
      workspaceId: "ws-1",
      shotId: "shot-1",
      videoUrl: null,
      objectKey: null,
      thumbnailUrl: null,
      durationSec: null,
      width: null,
      height: null,
      provider: "seedance",
      providerResponse: { candidateIndex: 0 },
      status: "PENDING",
      errorMessage: null,
    });

    await assert.rejects(
      processGenerateVideoCandidate(
        {
          kind: "generate_video_candidate",
          jobId: "job-v-rate-limit",
          batchId: ctx.batchId,
          candidateId: "vcd-rate-limit",
          candidateIndex: 0,
          shotId: "shot-1",
          workspaceId: "ws-1",
          videoScriptArtifactId: "art-vid-1",
          aspectRatio: "9:16",
          traceId: "trace-v-rate-limit",
        },
        fakeDb.adapter as any,
        { attemptsMade: 0, attempts: 2 },
      ),
      /EndpointAccountRpmRateLimitExceeded/,
    );

    const retryable = fakeDb.videoCandidateRows.get("vcd-rate-limit");
    assert.equal(retryable.status, "RUNNING");
    assert.equal(retryable.errorMessage, null);
  });

  it("keeps a provider-ready video candidate PERSISTING and records persist failure before the final queue attempt", async () => {
    const traceEvents: any[] = [];
    traceService.record = (async (input: any) => {
      traceEvents.push(input);
    }) as any;
    __setVideoProviderForTests(async (args) => ({
      videoUrl: "https://provider/video-ready.mp4",
      provider: "seedance",
      model: "ep-video",
      prompt: args.prompt,
      taskId: "seedance-task-persist-fail",
      createdAt: 123,
    }));
    __setGeneratedAssetPersisterForTests(async () => {
      throw new Error("download socket reset");
    });

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("RUNNING");
    await fakeDb.adapter.insertVideoCandidate({
      id: "vcd-persist-retry",
      batchId: ctx.batchId,
      workspaceId: "ws-1",
      shotId: "shot-1",
      videoUrl: null,
      objectKey: null,
      thumbnailUrl: null,
      durationSec: null,
      width: null,
      height: null,
      provider: "seedance",
      providerResponse: { candidateIndex: 0 },
      status: "PENDING",
      errorMessage: null,
    });

    await assert.rejects(
      processGenerateVideoCandidate(
        {
          kind: "generate_video_candidate",
          jobId: "job-v-persist-retry",
          batchId: ctx.batchId,
          candidateId: "vcd-persist-retry",
          candidateIndex: 0,
          shotId: "shot-1",
          workspaceId: "ws-1",
          videoScriptArtifactId: "art-vid-1",
          aspectRatio: "9:16",
          traceId: "trace-v-persist-retry",
        },
        fakeDb.adapter as any,
        { attemptsMade: 0, attempts: 2 },
      ),
      /download socket reset/,
    );

    const retryable = fakeDb.videoCandidateRows.get("vcd-persist-retry");
    assert.equal(retryable.status, "PERSISTING");
    assert.equal(retryable.errorMessage, null);
    assert.equal(
      retryable.providerResponse.providerTemporaryUrl,
      "https://provider/video-ready.mp4",
    );
    assert.equal(
      traceEvents.some((event) => event.name === "asset_persist_failed"),
      true,
    );
  });

  it("marks a provider-ready video candidate FAILED when persist fails on the final queue attempt", async () => {
    __setVideoProviderForTests(async (args) => ({
      videoUrl: "https://provider/video-ready-final.mp4",
      provider: "seedance",
      model: "ep-video",
      prompt: args.prompt,
      taskId: "seedance-task-final-fail",
      createdAt: 123,
    }));
    __setGeneratedAssetPersisterForTests(async () => {
      throw new Error("download timed out");
    });

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("RUNNING");
    await fakeDb.adapter.insertVideoCandidate({
      id: "vcd-persist-final",
      batchId: ctx.batchId,
      workspaceId: "ws-1",
      shotId: "shot-1",
      videoUrl: null,
      objectKey: null,
      thumbnailUrl: null,
      durationSec: null,
      width: null,
      height: null,
      provider: "seedance",
      providerResponse: { candidateIndex: 0 },
      status: "PENDING",
      errorMessage: null,
    });

    await processGenerateVideoCandidate(
      {
        kind: "generate_video_candidate",
        jobId: "job-v-persist-final",
        batchId: ctx.batchId,
        candidateId: "vcd-persist-final",
        candidateIndex: 0,
        shotId: "shot-1",
        workspaceId: "ws-1",
        videoScriptArtifactId: "art-vid-1",
        aspectRatio: "9:16",
        traceId: "trace-v-persist-final",
      },
      fakeDb.adapter as any,
      { attemptsMade: 1, attempts: 2 },
    );

    const failed = fakeDb.videoCandidateRows.get("vcd-persist-final");
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.errorMessage, "download timed out");
    assert.equal(fakeDb.batches.get(ctx.batchId)?.status, "FAILED");
  });
});
