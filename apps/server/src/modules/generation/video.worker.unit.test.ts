import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  processGenerateVideos,
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
  };
  async function bootstrap(status: string) {
    const batchId = "vbb-1";
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
      assert.equal(
        traces[0]?.stableUrl,
        "/api/workspaces/ws-1/videos/vcd-trace.mp4",
      );
      assert.equal(
        traces[0]?.providerTemporaryUrl,
        "https://provider/video.mp4",
      );
    });
  });
});
