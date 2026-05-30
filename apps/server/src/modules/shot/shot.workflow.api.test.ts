import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";
import { transparentPngBytes } from "../../test/image-fixtures.js";

const cleanupDirs: string[] = [];

async function seedApprovedShotPromptWorkspace(app: FastifyInstance) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: { name: `shot-workflow-${Date.now()}` }
  });
  assert.equal(createResponse.statusCode, 200, createResponse.body);
  const workspace = createResponse.json().workspace as {
    id: string;
    localPath: string;
  };
  const directory = await mkdtemp(path.join(os.tmpdir(), "shot-workflow-"));
  cleanupDirs.push(directory);
  const bindResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/storage/bind`,
    payload: { kind: "local", localPath: directory }
  });
  assert.equal(bindResponse.statusCode, 200, bindResponse.body);

  const uploadResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces/materials",
    payload: {
      workspaceId: workspace.id,
      filename: "product.png",
      dataBase64: Buffer.from(transparentPngBytes).toString("base64")
    }
  });
  assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);

  const materialResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces/material-intake",
    payload: { workspaceId: workspace.id }
  });
  assert.equal(materialResponse.statusCode, 200, materialResponse.body);

  const briefResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces/brief/propose",
    payload: { workspaceId: workspace.id }
  });
  assert.equal(briefResponse.statusCode, 200, briefResponse.body);
  await app.inject({
    method: "POST",
    url: "/api/workspaces/artifacts/brief/approve",
    payload: {
      workspaceId: workspace.id,
      data: briefResponse.json().artifact.data
    }
  });

  const storyboardResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces/storyboard/propose",
    payload: { workspaceId: workspace.id }
  });
  assert.equal(storyboardResponse.statusCode, 200, storyboardResponse.body);
  await app.inject({
    method: "POST",
    url: "/api/workspaces/artifacts/storyboard/approve",
    payload: {
      workspaceId: workspace.id,
      data: storyboardResponse.json().artifact.data
    }
  });

  const shotPromptResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces/shotprompt/compile",
    payload: { workspaceId: workspace.id }
  });
  assert.equal(shotPromptResponse.statusCode, 200, shotPromptResponse.body);
  const shotPrompt = shotPromptResponse.json().artifact.data;
  const firstShot = shotPrompt.shots[0];
  const approvalResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces/artifacts/shotprompt/approve",
    payload: {
      workspaceId: workspace.id,
      data: {
        ...shotPrompt,
        durationSec: firstShot.endSec - firstShot.startSec,
        shots: [firstShot],
        tts: {
          ...shotPrompt.tts,
          voiceover: firstShot.voiceover
        }
      }
    }
  });
  assert.equal(approvalResponse.statusCode, 200, approvalResponse.body);

  const shotsResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspace.id}/shots`
  });
  assert.equal(shotsResponse.statusCode, 200, shotsResponse.body);
  const shot = shotsResponse.json().data[0] as { id: string };
  assert.ok(shot.id, "expected at least one seeded shot");

  return { workspaceId: workspace.id, shotId: shot.id };
}

describe("shot workflow API", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
    await Promise.all(
      cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  it("keeps refresh-resumable batch ids and writes image/video selections to V2 tables", async () => {
    const { workspaceId, shotId } = await seedApprovedShotPromptWorkspace(app);

    const imagePromptResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`,
      payload: { referenceAssetIds: [] }
    });
    assert.equal(imagePromptResponse.statusCode, 200, imagePromptResponse.body);
    const imagePromptId = imagePromptResponse.json().data.id as string;
    assert.deepEqual(imagePromptResponse.json().context.referenceAssetRefs, [
      "product.png"
    ]);
    assert.equal(
      imagePromptResponse.json().data.reference_asset_ids?.length ??
        imagePromptResponse.json().data.referenceAssetIds?.length,
      1
    );

    const imageBatchResponse = await app.inject({
      method: "POST",
      url: `/api/shots/${shotId}/image-batches`,
      headers: { "Idempotency-Key": `test-image-${Date.now()}` },
      payload: {
        imagePromptArtifactId: imagePromptId,
        count: 3,
        aspectRatio: "9:16"
      }
    });
    assert.equal(imageBatchResponse.statusCode, 200, imageBatchResponse.body);
    const imageBatchId = imageBatchResponse.json().data.batchId as string;

    const imageStatusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shot-workflow-status`
    });
    assert.equal(imageStatusResponse.statusCode, 200, imageStatusResponse.body);
    const imageStatusShot = imageStatusResponse
      .json()
      .data.shots.find((s: { shotId: string }) => s.shotId === shotId);
    assert.equal(imageStatusShot.activeImageBatchId, imageBatchId);

    const imageCandidate = await db.db2.insertImageCandidate({
      id: `imc_${Date.now()}`,
      batchId: imageBatchId,
      workspaceId,
      shotId,
      imageUrl: "https://cdn.example/image.png",
      objectKey: null,
      width: 720,
      height: 1280,
      seed: null,
      provider: "mock",
      providerResponse: {},
      status: "SUCCEEDED",
      errorMessage: null
    });
    const failedImageCandidate = await db.db2.insertImageCandidate({
      id: `imc_failed_${Date.now()}`,
      batchId: imageBatchId,
      workspaceId,
      shotId,
      imageUrl: null,
      objectKey: null,
      width: null,
      height: null,
      seed: null,
      provider: "mock",
      providerResponse: {},
      status: "FAILED",
      errorMessage: "provider blocked"
    });

    const failedSelectImageResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-candidates/select`,
      payload: { candidateId: failedImageCandidate.id }
    });
    assert.equal(failedSelectImageResponse.statusCode, 400);
    assert.equal(
      failedSelectImageResponse.json().code,
      "CANNOT_SELECT_FAILED_CANDIDATE"
    );

    const selectImageResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-candidates/select`,
      payload: {
        candidateId: imageCandidate.id
      }
    });
    assert.equal(selectImageResponse.statusCode, 200, selectImageResponse.body);
    assert.equal(selectImageResponse.json().shotStatus, "IMAGE_SELECTED");
    assert.equal(selectImageResponse.json().selectedImageUrl, imageCandidate.imageUrl);
    assert.equal(selectImageResponse.json().allShotsImageSelected, true);
    const selectedImage = await db.db2.getSelectedImage(shotId);
    assert.equal(selectedImage?.imageCandidateId, imageCandidate.id);
    assert.equal(selectedImage?.imageGenerationBatchId, imageBatchId);
    const activeImagePrompt = await db.db2.getImagePromptArtifact(imagePromptId);
    assert.equal(activeImagePrompt.status, "ACTIVE");

    const imageRoundsResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-rounds`
    });
    assert.equal(imageRoundsResponse.statusCode, 200, imageRoundsResponse.body);
    assert.equal(imageRoundsResponse.json().data[0].batch.id, imageBatchId);
    assert.equal(imageRoundsResponse.json().data[0].selection.selectedCandidateId, imageCandidate.id);

    const videoScriptResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/video-scripts/propose`,
      payload: { durationSec: 4, useNeighborFrames: true }
    });
    assert.equal(videoScriptResponse.statusCode, 200, videoScriptResponse.body);
    const videoScriptId = videoScriptResponse.json().data.id as string;
    assert.equal(
      videoScriptResponse.json().context.sceneAnchorImageUrl,
      imageCandidate.imageUrl
    );

    const videoBatchResponse = await app.inject({
      method: "POST",
      url: `/api/shots/${shotId}/video-batches`,
      headers: { "Idempotency-Key": `test-video-${Date.now()}` },
      payload: {
        videoScriptArtifactId: videoScriptId,
        count: 5,
        aspectRatio: "9:16"
      }
    });
    assert.equal(videoBatchResponse.statusCode, 200, videoBatchResponse.body);
    const videoBatchId = videoBatchResponse.json().data.batchId as string;

    const videoStatusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shot-workflow-status`
    });
    assert.equal(videoStatusResponse.statusCode, 200, videoStatusResponse.body);
    const videoStatusShot = videoStatusResponse
      .json()
      .data.shots.find((s: { shotId: string }) => s.shotId === shotId);
    assert.equal(videoStatusShot.activeImageBatchId, imageBatchId);
    assert.equal(videoStatusShot.activeVideoBatchId, videoBatchId);

    const videoCandidate = await db.db2.insertVideoCandidate({
      id: `vcd_${Date.now()}`,
      batchId: videoBatchId,
      workspaceId,
      shotId,
      videoUrl: "https://cdn.example/video.mp4",
      objectKey: null,
      thumbnailUrl: null,
      durationSec: 4,
      width: 720,
      height: 1280,
      provider: "mock",
      providerResponse: {},
      status: "SUCCEEDED",
      errorMessage: null
    });
    const failedVideoCandidate = await db.db2.insertVideoCandidate({
      id: `vcd_failed_${Date.now()}`,
      batchId: videoBatchId,
      workspaceId,
      shotId,
      videoUrl: null,
      objectKey: null,
      thumbnailUrl: null,
      durationSec: null,
      width: null,
      height: null,
      provider: "mock",
      providerResponse: {},
      status: "FAILED",
      errorMessage: "provider blocked"
    });

    const failedSelectVideoResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/video-candidates/select`,
      payload: { candidateId: failedVideoCandidate.id }
    });
    assert.equal(failedSelectVideoResponse.statusCode, 400);
    assert.equal(
      failedSelectVideoResponse.json().code,
      "CANNOT_SELECT_FAILED_CANDIDATE"
    );

    const selectVideoResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/video-candidates/select`,
      payload: {
        candidateId: videoCandidate.id
      }
    });
    assert.equal(selectVideoResponse.statusCode, 200, selectVideoResponse.body);
    assert.equal(selectVideoResponse.json().shotStatus, "VIDEO_SELECTED");
    assert.equal(selectVideoResponse.json().selectedVideoUrl, videoCandidate.videoUrl);
    assert.equal(selectVideoResponse.json().allShotsVideoSelected, true);

    const videoRoundsResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/video-rounds`
    });
    assert.equal(videoRoundsResponse.statusCode, 200, videoRoundsResponse.body);
    assert.equal(videoRoundsResponse.json().data[0].batch.id, videoBatchId);
    assert.equal(videoRoundsResponse.json().data[0].selection.selectedCandidateId, videoCandidate.id);

    const selectedVideoResult = await db.db2.pool().query(
      `select video_candidate_id, video_generation_batch_id
       from selected_shot_videos
       where shot_id = $1`,
      [shotId]
    );
    assert.equal(selectedVideoResult.rows[0]?.video_candidate_id, videoCandidate.id);
    assert.equal(selectedVideoResult.rows[0]?.video_generation_batch_id, videoBatchId);
  });
});
