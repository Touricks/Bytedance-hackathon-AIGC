import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { db } from "../../db/client.js";
import { HttpError } from "../../common/errors.js";
import { traceService } from "../trace/trace.service.js";
import { shotSetService } from "../workspace/shot-set.service.js";
import { shotWorkflowService } from "./shot.service.js";

const db2Descriptor = Object.getOwnPropertyDescriptor(db, "db2");
const originalListActiveShots = shotSetService.listActiveShots;
const originalGetActiveShotSet = shotSetService.getActiveShotSet;
const originalTraceRecord = traceService.record;

function patchDb2(fakeDb2: unknown) {
  Object.defineProperty(db, "db2", {
    configurable: true,
    value: fakeDb2,
  });
}

afterEach(() => {
  if (db2Descriptor) {
    Object.defineProperty(db, "db2", db2Descriptor);
  }
  shotSetService.listActiveShots = originalListActiveShots;
  shotSetService.getActiveShotSet = originalGetActiveShotSet;
  traceService.record = originalTraceRecord;
});

describe("shotWorkflowService.selectVideo", () => {
  it("rejects PERSISTING candidates even when a temporary preview URL exists", async () => {
    shotSetService.listActiveShots = (async () => [
      {
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
        selectedVideoId: null,
      },
    ]) as any;
    traceService.record = (async () => undefined) as any;
    patchDb2({
      getShot: async () => ({
        id: "shot-1",
        workspaceId: "ws-1",
        defaultDurationSec: 4,
      }),
      getVideoCandidate: async () => ({
        id: "vcd-persisting",
        batchId: "vbb-1",
        workspaceId: "ws-1",
        shotId: "shot-1",
        videoUrl: null,
        objectKey: null,
        durationSec: 4,
        providerResponse: {
          providerTemporaryUrl: "https://provider.example/video.mp4",
        },
        status: "PERSISTING",
        errorMessage: null,
      }),
      getVideoBatch: async () => ({
        id: "vbb-1",
        workspaceId: "ws-1",
        shotId: "shot-1",
      }),
      upsertSelectedVideo: async () => {
        throw new Error("must not select persisting candidate");
      },
      updateShot: async () => {
        throw new Error("must not update shot for persisting candidate");
      },
    });

    await assert.rejects(
      shotWorkflowService.selectVideo({
        workspaceId: "ws-1",
        shotId: "shot-1",
        videoCandidateId: "vcd-persisting",
        videoGenerationBatchId: "vbb-1",
      }),
      (error) =>
        error instanceof HttpError &&
        error.statusCode === 400 &&
        error.code === "CANNOT_SELECT_FAILED_CANDIDATE",
    );
  });
});

describe("shotWorkflowService generation idempotency guards", () => {
  it("rejects image generation while shot image auto-selection is active", async () => {
    let checkedActiveImageBatch = false;
    shotSetService.listActiveShots = (async () => [
      {
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
        selectedImageId: null,
      },
    ]) as any;
    patchDb2({
      getShot: async () => ({
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
      }),
      getActiveShotImageAutoSelectionJob: async () => ({
        id: "sias-running",
        workspaceId: "ws-1",
        status: "RUNNING",
        shotSetId: "shot-set-1",
        createdAt: "2026-06-20T00:00:00.000Z",
      }),
      getActiveImageBatchForShot: async () => {
        checkedActiveImageBatch = true;
        return null;
      },
    });

    await assert.rejects(
      shotWorkflowService.proposeImagePrompt({
        workspaceId: "ws-1",
        shotId: "shot-1",
      }),
      (error) =>
        error instanceof HttpError &&
        error.statusCode === 409 &&
        error.code === "SHOT_IMAGE_AUTO_SELECTION_RUNNING",
    );
    assert.equal(checkedActiveImageBatch, false);
  });

  it("reuses an existing image batch instead of creating another one", async () => {
    const updates: unknown[] = [];
    shotSetService.listActiveShots = (async () => [
      {
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
        selectedImageId: null,
      },
    ]) as any;
    shotSetService.getActiveShotSet = (async () => ({
      id: "shot-set-1",
      workspaceId: "ws-1",
      status: "ACTIVE",
    })) as any;
    patchDb2({
      getShot: async () => ({
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
      }),
      getActiveShotImageAutoSelectionJob: async () => null,
      listActiveVideoBatchesForShotSet: async () => [],
      getLatestImageBatchForShot: async () => ({
        id: "imb-active",
        workspaceId: "ws-1",
        shotId: "shot-1",
        imagePromptArtifactId: "imp-active",
        status: "RUNNING",
        requestedCount: 2,
        succeededCount: 0,
        failedCount: 0,
        provider: "ark-seedream",
        aspectRatio: "9:16",
        providerRequest: {},
        errorMessage: null,
        idempotencyKey: "image:active",
        createdAt: "2026-06-20T00:00:00.000Z",
        updatedAt: "2026-06-20T00:00:00.000Z",
      }),
      getImagePromptArtifact: async () => ({
        id: "imp-active",
        shotId: "shot-1",
        version: 1,
        status: "ACTIVE",
        promptText: "existing prompt",
        negativePrompt: null,
        referenceAssetIds: [],
        promptJson: { context: { reused: true } },
        sourceFingerprint: {},
        promptAssembly: {},
        createdBy: "system",
        agentName: null,
        promptTemplateVersion: null,
        baseArtifactId: null,
        createdAt: "2026-06-20T00:00:00.000Z",
      }),
      listImageCandidatesByBatch: async () => [
        {
          id: "imc-active",
          batchId: "imb-active",
          workspaceId: "ws-1",
          shotId: "shot-1",
          imageUrl: null,
          objectKey: null,
          width: null,
          height: null,
          seed: null,
          provider: "ark-seedream",
          providerResponse: { candidateIndex: 0 },
          status: "RUNNING",
          errorMessage: null,
          createdAt: "2026-06-20T00:00:00.000Z",
        },
      ],
      updateShot: async (_shotId: string, patch: unknown) => {
        updates.push(patch);
      },
      insertImagePromptArtifact: async () => {
        throw new Error("must not create a new image prompt artifact");
      },
    });

    const result = await shotWorkflowService.proposeImagePrompt({
      workspaceId: "ws-1",
      shotId: "shot-1",
    });

    assert.equal(result.batch.id, "imb-active");
    assert.equal(result.artifact.id, "imp-active");
    assert.equal("deduped" in result && result.deduped, true);
    assert.equal("ignored" in result && result.ignored, true);
    assert.deepEqual(updates, [
      {
        status: "IMAGE_GENERATING",
        activeImagePromptArtifactId: "imp-active",
      },
    ]);
  });

  it("rejects image generation while video generation is active", async () => {
    let checkedLatestImageBatch = false;
    shotSetService.listActiveShots = (async () => [
      {
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
        selectedImageId: "imc-1",
      },
    ]) as any;
    shotSetService.getActiveShotSet = (async () => ({
      id: "shot-set-1",
      workspaceId: "ws-1",
      status: "ACTIVE",
    })) as any;
    patchDb2({
      getShot: async () => ({
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
      }),
      getActiveShotImageAutoSelectionJob: async () => null,
      listActiveVideoBatchesForShotSet: async () => [
        {
          id: "vbb-running",
          shotId: "shot-1",
          status: "RUNNING",
        },
      ],
      getLatestImageBatchForShot: async () => {
        checkedLatestImageBatch = true;
        return null;
      },
    });

    await assert.rejects(
      shotWorkflowService.proposeImagePrompt({
        workspaceId: "ws-1",
        shotId: "shot-1",
      }),
      (error) =>
        error instanceof HttpError &&
        error.statusCode === 409 &&
        error.code === "VIDEO_BATCH_RUNNING",
    );
    assert.equal(checkedLatestImageBatch, false);
  });

  it("reuses an active video batch instead of creating another one", async () => {
    shotSetService.listActiveShots = (async () => [
      {
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
        selectedImageId: null,
      },
    ]) as any;
    patchDb2({
      getShot: async () => ({
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
      }),
      getActiveVideoBatchForShot: async () => ({
        id: "vbb-active",
        workspaceId: "ws-1",
        shotId: "shot-1",
        videoScriptArtifactId: "vsa-active",
        status: "PENDING",
        requestedCount: 1,
        succeededCount: 0,
        failedCount: 0,
        provider: "seedance",
        aspectRatio: "9:16",
        providerRequest: {
          firstFrameCandidateId: "imc-selected",
          firstFrameUrl: "/image.png",
        },
        errorMessage: null,
        idempotencyKey: "video:active",
        createdAt: "2026-06-20T00:00:00.000Z",
        updatedAt: "2026-06-20T00:00:00.000Z",
      }),
      getVideoScriptArtifact: async () => ({
        id: "vsa-active",
        shotId: "shot-1",
        version: 1,
        status: "ACTIVE",
        durationSec: 5,
        scriptJson: { context: { reused: true } },
        providerPrompt: "existing video prompt",
        basedOnImageCandidateId: "imc-selected",
        basedOnPrevImageCandidateId: null,
        basedOnNextImageCandidateId: null,
        sourceFingerprint: {},
        promptAssembly: {},
        createdBy: "system",
        agentName: null,
        promptTemplateVersion: null,
        baseArtifactId: null,
        createdAt: "2026-06-20T00:00:00.000Z",
      }),
      listVideoCandidatesByBatch: async () => [],
      updateShot: async () => undefined,
      getSelectedImage: async () => {
        throw new Error("must not validate image selection for active duplicate");
      },
    });

    const result = await shotWorkflowService.proposeVideoScript({
      workspaceId: "ws-1",
      shotId: "shot-1",
    });

    assert.equal(result.batch.id, "vbb-active");
    assert.equal(result.artifact.id, "vsa-active");
    assert.equal("deduped" in result && result.deduped, true);
    assert.equal("ignored" in result && result.ignored, true);
  });
});
