import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  processGenerateVideos,
  __setGeneratedAssetPersisterForTests,
  __setVideoProviderForTests,
} from "./video.worker.js";
import { traceService } from "../trace/trace.service.js";
import { jobRepository } from "../job/job.repository.js";

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
      videoCandidates.push(input);
      return { ...input, id: "vcd-" + videoCandidates.length, createdAt: new Date().toISOString() };
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
  return { adapter, batches, videoCandidates, shotPatches, bootstrap };
}

const origRecord = traceService.record;
const origJobUpdate = jobRepository.update;

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
    assert.match(fake.calls[0]?.prompt, /不要在画面里生成字幕/);
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
});
