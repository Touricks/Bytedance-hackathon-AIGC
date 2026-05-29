import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";
import { transparentPngBytes } from "../../test/image-fixtures.js";

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
  const approvalResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces/artifacts/shotprompt/approve",
    payload: {
      workspaceId: workspace.id,
      data: shotPromptResponse.json().artifact.data
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

    const selectImageResponse = await app.inject({
      method: "POST",
      url: `/api/shots/${shotId}/selected-image`,
      payload: {
        imageCandidateId: imageCandidate.id,
        imageGenerationBatchId: imageBatchId
      }
    });
    assert.equal(selectImageResponse.statusCode, 200, selectImageResponse.body);
    assert.equal(selectImageResponse.json().shotStatus, "IMAGE_SELECTED");
    const selectedImage = await db.db2.getSelectedImage(shotId);
    assert.equal(selectedImage?.imageCandidateId, imageCandidate.id);

    const videoScriptResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/video-scripts/propose`,
      payload: { durationSec: 4, useNeighborFrames: true }
    });
    assert.equal(videoScriptResponse.statusCode, 200, videoScriptResponse.body);
    const videoScriptId = videoScriptResponse.json().data.id as string;

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

    const selectVideoResponse = await app.inject({
      method: "POST",
      url: `/api/shots/${shotId}/selected-video`,
      payload: {
        videoCandidateId: videoCandidate.id,
        videoGenerationBatchId: videoBatchId
      }
    });
    assert.equal(selectVideoResponse.statusCode, 200, selectVideoResponse.body);
    assert.equal(selectVideoResponse.json().shotStatus, "VIDEO_SELECTED");

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
