import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { config } from "../../common/config.js";
import { db } from "../../db/client.js";
import { transparentPngBytes } from "../../test/image-fixtures.js";

const cleanupDirs: string[] = [];

function assertPromptAssembly(value: unknown, moduleId: string) {
  assert.ok(value && typeof value === "object", "expected promptAssembly object");
  const assembly = value as Record<string, unknown>;
  assert.equal(assembly.moduleId, moduleId);
  assert.equal(assembly.assemblerVersion, "v2");
  assert.match(String(assembly.subjectHash), /^[a-f0-9]{64}$/);
  assert.match(String(assembly.contractHash), /^[a-f0-9]{64}$/);
  assert.match(String(assembly.subjectTemplateId), /subject\.md$/);
  assert.match(String(assembly.contractTemplateId), /contract\.md$/);
}

async function seedApprovedShotPromptWorkspace(
  app: FastifyInstance,
  shotCount = 1,
  options: { registerMaterialAsset?: boolean } = {}
) {
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

  if (options.registerMaterialAsset === false) {
    const materialDirectory = path.join(directory, ".daireel", "materials");
    await mkdir(materialDirectory, { recursive: true });
    await writeFile(path.join(materialDirectory, "product.png"), transparentPngBytes);
  } else {
    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/materials`,
      payload: {
        filename: "product.png",
        dataBase64: Buffer.from(transparentPngBytes).toString("base64")
      }
    });
    assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);
  }

  const requirementsProposeResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/prompt-requirements/propose`,
    payload: {
      data: {
        image: { style: "clean ecommerce product photo" },
        shotImage: { global: "preserve exact product identity" },
        shotVideo: { global: "smooth motion and stable product shape" }
      }
    }
  });
  assert.equal(
    requirementsProposeResponse.statusCode,
    200,
    requirementsProposeResponse.body
  );
  const requirementsApproveResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/prompt-requirements/approve`,
    payload: { artifactId: requirementsProposeResponse.json().data.id }
  });
  assert.equal(
    requirementsApproveResponse.statusCode,
    200,
    requirementsApproveResponse.body
  );

  const materialResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/material-intake/propose`,
    payload: {}
  });
  assert.equal(materialResponse.statusCode, 200, materialResponse.body);
  const materialApproveResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/material-intake/approve`,
    payload: { artifactId: materialResponse.json().data.id }
  });
  assert.equal(materialApproveResponse.statusCode, 200, materialApproveResponse.body);

  const briefResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/product-brief/propose`,
    payload: {}
  });
  assert.equal(briefResponse.statusCode, 200, briefResponse.body);
  const briefApproveResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/product-brief/approve`,
    payload: {
      artifactId: briefResponse.json().data.id
    }
  });
  assert.equal(briefApproveResponse.statusCode, 200, briefApproveResponse.body);

  const storyboardResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/storyboard/propose`,
    payload: {}
  });
  assert.equal(storyboardResponse.statusCode, 200, storyboardResponse.body);
  const storyboardApproveResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/storyboard/approve`,
    payload: {
      artifactId: storyboardResponse.json().data.id
    }
  });
  assert.equal(storyboardApproveResponse.statusCode, 200, storyboardApproveResponse.body);

  const shotPromptResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/shotprompt/propose`,
    payload: {}
  });
  assert.equal(shotPromptResponse.statusCode, 200, shotPromptResponse.body);
  const shotPrompt = shotPromptResponse.json().data.data;
  const approvedShots = shotPrompt.shots.slice(0, shotCount);
  const firstShot = approvedShots[0];
  assert.ok(firstShot, "shotprompt produced no shots");
  const approvalResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/shotprompt/approve`,
    payload: {
      data: {
        ...shotPrompt,
        durationSec: firstShot.endSec - firstShot.startSec,
        shots: approvedShots,
        tts: {
          ...shotPrompt.tts,
          voiceover: firstShot.voiceover
        }
      }
    }
  });
  assert.equal(approvalResponse.statusCode, 200, approvalResponse.body);
  const shotSetResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/shot-sets`,
    payload: { shotPromptArtifactId: approvalResponse.json().data.id }
  });
  assert.equal(shotSetResponse.statusCode, 200, shotSetResponse.body);

  const shotsResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspace.id}/shots`
  });
  assert.equal(shotsResponse.statusCode, 200, shotsResponse.body);
  const shots = shotsResponse.json().data as Array<{ id: string }>;
  const shot = shots[0];
  assert.ok(shot, "expected at least one seeded shot");
  assert.ok(shot.id, "expected seeded shot to have an id");

  return {
    workspaceId: workspace.id,
    shotId: shot.id,
    shotIds: shots.map((item) => item.id)
  };
}

async function reapproveCurrentShotPrompt(app: FastifyInstance, workspaceId: string) {
  const statusResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/status`
  });
  assert.equal(statusResponse.statusCode, 200, statusResponse.body);
  const shotPrompt = statusResponse.json().artifacts.shotPrompt.data;
  const approveResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/shotprompt/approve`,
    payload: {
      data: {
        ...shotPrompt,
        prompt: `${shotPrompt.prompt ?? ""}\nupdated upstream shotprompt`
      }
    }
  });
  assert.equal(approveResponse.statusCode, 200, approveResponse.body);
  return approveResponse.json().data as { id: string; data: { shots: unknown[] } };
}

async function completeImageSelection(
  app: FastifyInstance,
  workspaceId: string,
  shotId: string
) {
  const imagePromptResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`,
    payload: {}
  });
  assert.equal(imagePromptResponse.statusCode, 200, imagePromptResponse.body);
  const imageBatchId = imagePromptResponse.json().batch.id as string;
  const imageCandidates = imagePromptResponse.json().candidates as Array<{
    id: string;
  }>;
  for (const candidate of imageCandidates) {
    await db.db2.updateImageCandidate(candidate.id, {
      status: "SUCCEEDED",
      imageUrl: `/api/workspaces/${workspaceId}/materials/generated-images/${candidate.id}.png`,
      objectKey: `materials/generated-images/${candidate.id}.png`
    });
  }
  await db.db2.updateImageBatch(imageBatchId, {
    status: "SUCCEEDED",
    succeededCount: imageCandidates.length,
    failedCount: 0
  });
  await db.db2.updateShot(shotId, { status: "IMAGE_CANDIDATES_READY" });
  const imageCandidate = imageCandidates[0];
  assert.ok(imageCandidate);
  const selectImageResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-candidates/select`,
    payload: { candidateId: imageCandidate.id }
  });
  assert.equal(selectImageResponse.statusCode, 200, selectImageResponse.body);
  return {
    imageCandidateId: imageCandidate.id,
    selection: selectImageResponse.json()
  };
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

  it("returns an empty workflow status before an active shot set exists", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: `shot-workflow-empty-${Date.now()}` }
    });
    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const workspaceId = createResponse.json().workspace.id as string;

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shot-workflow-status`
    });
    assert.equal(statusResponse.statusCode, 200, statusResponse.body);
    assert.deepEqual(statusResponse.json().data, {
      workspaceId,
      shots: [],
      canComposeFinalVideo: false
    });
  });

  it("keeps refresh-resumable batch ids and writes image/video selections to V2 tables", async () => {
    const { workspaceId, shotId } = await seedApprovedShotPromptWorkspace(app);

    const imagePromptResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`,
      payload: {}
    });
    assert.equal(imagePromptResponse.statusCode, 200, imagePromptResponse.body);
    const imagePromptId = imagePromptResponse.json().data.id as string;
    assertPromptAssembly(imagePromptResponse.json().data.promptAssembly, "image-prompt");
    const imageBatchId = imagePromptResponse.json().batch.id as string;
    const imageCandidates = imagePromptResponse.json().candidates as Array<{
      id: string;
      imageUrl: string | null;
      status: string;
    }>;
    assert.equal(imagePromptResponse.json().shotStatus, "IMAGE_GENERATING");
    assert.equal(imageCandidates.length, config.defaultImageCandidates);
    assert.ok(
      imageCandidates.every((candidate) => candidate.status === "PENDING"),
      "image candidates should be queued as individual jobs"
    );
    assert.deepEqual(imagePromptResponse.json().context.referenceAssetRefs, [
      "product.png"
    ]);
    assert.equal(
      imagePromptResponse.json().data.reference_asset_ids?.length ??
        imagePromptResponse.json().data.referenceAssetIds?.length,
      1
    );

    const imageStatusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shot-workflow-status`
    });
    assert.equal(imageStatusResponse.statusCode, 200, imageStatusResponse.body);
    const imageStatusShot = imageStatusResponse
      .json()
      .data.shots.find((s: { shotId: string }) => s.shotId === shotId);
    assert.equal(imageStatusShot.activeImageBatchId, imageBatchId);

    for (const candidate of imageCandidates) {
      await db.db2.updateImageCandidate(candidate.id, {
        status: "SUCCEEDED",
        imageUrl: `/api/workspaces/${workspaceId}/materials/generated-images/${candidate.id}.png`,
        objectKey: `materials/generated-images/${candidate.id}.png`
      });
    }
    await db.db2.updateImageBatch(imageBatchId, {
      status: "SUCCEEDED",
      succeededCount: imageCandidates.length,
      failedCount: 0
    });
    await db.db2.updateShot(shotId, { status: "IMAGE_CANDIDATES_READY" });
    const completedImageCandidates =
      await db.db2.listImageCandidatesByBatch(imageBatchId);
    const imageCandidate = completedImageCandidates.find(
      (candidate) => candidate.status === "SUCCEEDED" && candidate.imageUrl
    );
    assert.ok(imageCandidate);
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
    assert.equal(failedSelectImageResponse.json().code, "CANNOT_SELECT_FAILED_CANDIDATE");

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
    assertPromptAssembly(activeImagePrompt.promptAssembly, "image-prompt");

    const imageRoundsResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-rounds`
    });
    assert.equal(imageRoundsResponse.statusCode, 200, imageRoundsResponse.body);
    assert.equal(imageRoundsResponse.json().data[0].batch.id, imageBatchId);
    assert.equal(
      imageRoundsResponse.json().data[0].selection.selectedCandidateId,
      imageCandidate.id
    );

    const regenerateResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/regenerate`,
      payload: {
        baseArtifactId: imagePromptId,
        prompt: {
          promptText: "清爽真实摄影风格，商品完整居中展示，背景延续上一轮场景。",
          negativePrompt: "商品变形、文字乱码、手部遮挡",
          visualStyle: "清爽真实摄影",
          composition: "主体居中，轻微低机位",
          lighting: "柔和自然光",
          productVisibilityRule: "商品完整可见，logo 清晰，不裁切。",
          referenceImageUsage: [],
          qualityChecklist: ["商品不变形", "背景保持连续"]
        }
      }
    });
    assert.equal(regenerateResponse.statusCode, 200, regenerateResponse.body);
    const regeneratedPromptId = regenerateResponse.json().data.id as string;
    assert.notEqual(regeneratedPromptId, imagePromptId);
    assert.equal(regenerateResponse.json().data.baseArtifactId, imagePromptId);
    assert.equal(regenerateResponse.json().data.createdBy, "user");
    assert.equal(regenerateResponse.json().shotStatus, "IMAGE_GENERATING");
    const regeneratedBatchId = regenerateResponse.json().batch.id as string;
    const regeneratedPrompt = await db.db2.getImagePromptArtifact(regeneratedPromptId);
    assert.equal(regeneratedPrompt.baseArtifactId, imagePromptId);
    assert.equal(regeneratedPrompt.promptText, "清爽真实摄影风格，商品完整居中展示，背景延续上一轮场景。");
    const regeneratedBatch = await db.db2.getImageBatch(regeneratedBatchId);
    assert.equal(
      (regeneratedBatch.providerRequest as Record<string, unknown>).prompt,
      "清爽真实摄影风格，商品完整居中展示，背景延续上一轮场景。"
    );
    assert.equal(
      (regeneratedBatch.providerRequest as Record<string, unknown>).negativePrompt,
      "商品变形、文字乱码、手部遮挡"
    );
    const selectedAfterRegenerate = await db.db2.getSelectedImage(shotId);
    assert.equal(selectedAfterRegenerate?.imageCandidateId, imageCandidate.id);

    const videoScriptResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/video-scripts/propose`,
      payload: {}
    });
    assert.equal(videoScriptResponse.statusCode, 200, videoScriptResponse.body);
    assertPromptAssembly(videoScriptResponse.json().data.promptAssembly, "video-script");
    const videoBatchId = videoScriptResponse.json().batch.id as string;
    const videoCandidates = videoScriptResponse.json().candidates as Array<{
      id: string;
      videoUrl: string | null;
      status: string;
    }>;
    assert.equal(videoScriptResponse.json().shotStatus, "VIDEO_GENERATING");
    assert.equal(videoCandidates.length, config.defaultVideoCandidates);
    assert.ok(
      videoCandidates.every((candidate) => candidate.status === "PENDING"),
      "video candidates should be queued as individual jobs"
    );
    assert.equal(
      videoScriptResponse.json().context.sceneAnchorImageUrl,
      imageCandidate.imageUrl
    );

    const videoStatusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shot-workflow-status`
    });
    assert.equal(videoStatusResponse.statusCode, 200, videoStatusResponse.body);
    const videoStatusShot = videoStatusResponse
      .json()
      .data.shots.find((s: { shotId: string }) => s.shotId === shotId);
    assert.equal(videoStatusShot.activeImageBatchId, regeneratedBatchId);
    assert.equal(videoStatusShot.activeVideoBatchId, videoBatchId);
    assert.equal(videoStatusShot.selectedImageUrl, imageCandidate.imageUrl);

    // The video pipeline is now async: propose enqueues one job per candidate
    // and returns PENDING. Simulate the worker draining (USE_REDIS_QUEUE=false
    // in tests) by driving the candidates to SUCCEEDED, mirroring images above.
    for (const candidate of videoCandidates) {
      await db.db2.updateVideoCandidate(candidate.id, {
        status: "SUCCEEDED",
        videoUrl: `/api/workspaces/${workspaceId}/videos/${candidate.id}.mp4`,
        objectKey: `videos/${candidate.id}.mp4`
      });
    }
    await db.db2.updateVideoBatch(videoBatchId, {
      status: "SUCCEEDED",
      succeededCount: videoCandidates.length,
      failedCount: 0
    });
    await db.db2.updateShot(shotId, { status: "VIDEO_CANDIDATES_READY" });
    const completedVideoCandidates =
      await db.db2.listVideoCandidatesByBatch(videoBatchId);
    const videoCandidate = completedVideoCandidates.find(
      (candidate) => candidate.status === "SUCCEEDED" && candidate.videoUrl
    );
    assert.ok(videoCandidate);
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
    assert.equal(failedSelectVideoResponse.json().code, "CANNOT_SELECT_FAILED_CANDIDATE");

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
    assert.equal(
      videoRoundsResponse.json().data[0].selection.selectedCandidateId,
      videoCandidate.id
    );

    const selectedVideoResult = await db.db2.pool().query(
      `select video_candidate_id, video_generation_batch_id
       from video_select_artifacts
       where shot_id = $1`,
      [shotId]
    );
    assert.equal(selectedVideoResult.rows[0]?.video_candidate_id, videoCandidate.id);
    assert.equal(selectedVideoResult.rows[0]?.video_generation_batch_id, videoBatchId);

    const traceResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/traces?limit=100`
    });
    assert.equal(traceResponse.statusCode, 200, traceResponse.body);
    const traceNames = new Set(
      (traceResponse.json() as Array<{ name: string; shotId?: string }>)
        .filter((event) => event.shotId === shotId)
        .map((event) => event.name)
    );
    const missingTraceEvents = [
      "image_prompt_proposed",
      "image_candidate_selected",
      "video_script_proposed",
      "video_candidate_selected"
    ].filter((name) => !traceNames.has(name));
    assert.deepEqual(missingTraceEvents, []);
  });

  it("rejects deprecated prompt-api inputs on propose endpoints", async () => {
    const { workspaceId, shotId } = await seedApprovedShotPromptWorkspace(app);

    const imageResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`,
      payload: { referenceAssetIds: ["asset_legacy"] }
    });
    assert.equal(imageResponse.statusCode, 400);
    assert.match(imageResponse.json().message, /referenceAssetIds/);

    const videoResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/video-scripts/propose`,
      payload: { durationSec: 4, useNeighborFrames: true }
    });
    assert.equal(videoResponse.statusCode, 400);
    assert.match(videoResponse.json().message, /durationSec|useNeighborFrames/);
  });

  it("requires a previous selected image before proposing image candidates for shot N", async () => {
    const { workspaceId, shotIds } = await seedApprovedShotPromptWorkspace(app, 2);
    const secondShotId = shotIds[1];
    assert.ok(secondShotId);

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${secondShotId}/image-prompts/propose`,
      payload: {}
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, "NO_SCENE_ANCHOR");
  });

  it("keeps fallback shot image and shot video requirements separated", async () => {
    const { shotId } = await seedApprovedShotPromptWorkspace(app, 1);

    const result = await db.db2.pool().query(
      `select shot_image, shot_video
       from shot_prompt_requirements
       where shot_id = $1
       limit 1`,
      [shotId]
    );
    const shotImage = result.rows[0]?.shot_image as Record<string, unknown>;
    const shotVideo = result.rows[0]?.shot_video as Record<string, unknown>;

    assert.equal(typeof shotImage.scene, "string");
    assert.equal(typeof shotVideo.subjectMotion, "string");
    assert.notEqual(shotImage.scene, shotVideo.subjectMotion);
    assert.notEqual(shotImage.scene, shotVideo.firstFrameIntent);
  });

  it("requires all shots to have selected images before proposing video candidates", async () => {
    const { workspaceId, shotIds } = await seedApprovedShotPromptWorkspace(app, 2);
    const firstShotId = shotIds[0];
    const secondShotId = shotIds[1];
    assert.ok(firstShotId);
    assert.ok(secondShotId);

    const imagePromptResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${firstShotId}/image-prompts/propose`,
      payload: {}
    });
    assert.equal(imagePromptResponse.statusCode, 200, imagePromptResponse.body);
    const imageCandidates = imagePromptResponse.json().candidates as Array<{
      id: string;
      imageUrl: string | null;
      status: string;
    }>;
    const imageCandidate = imageCandidates[0];
    assert.ok(imageCandidate);
    const imageBatchId = imagePromptResponse.json().batch.id as string;
    for (const candidate of imageCandidates) {
      await db.db2.updateImageCandidate(candidate.id, {
        status: "SUCCEEDED",
        imageUrl: `/api/workspaces/${workspaceId}/materials/generated-images/${candidate.id}.png`,
        objectKey: `materials/generated-images/${candidate.id}.png`
      });
    }
    await db.db2.updateImageBatch(imageBatchId, {
      status: "SUCCEEDED",
      succeededCount: imageCandidates.length,
      failedCount: 0
    });
    await db.db2.updateShot(firstShotId, { status: "IMAGE_CANDIDATES_READY" });

    const selectImageResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${firstShotId}/image-candidates/select`,
      payload: { candidateId: imageCandidate.id }
    });
    assert.equal(selectImageResponse.statusCode, 200, selectImageResponse.body);

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${firstShotId}/video-scripts/propose`,
      payload: {}
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, "IMAGE_SELECTION_INCOMPLETE");
    assert.match(response.json().message, new RegExp(secondShotId));
  });

  it("marks downstream status and active shot set when upstream artifacts are re-approved", async () => {
    const { workspaceId } = await seedApprovedShotPromptWorkspace(app, 2);

    const initialStatusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`
    });
    assert.equal(initialStatusResponse.statusCode, 200, initialStatusResponse.body);
    const brief = initialStatusResponse.json().artifacts.brief.data;
    const briefApproveResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/product-brief/approve`,
      payload: {
        data: {
          ...brief,
          assumptions: [...(brief.assumptions ?? []), "upstream changed in test"]
        }
      }
    });
    assert.equal(briefApproveResponse.statusCode, 200, briefApproveResponse.body);

    const driftStatusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`
    });
    assert.equal(driftStatusResponse.statusCode, 200, driftStatusResponse.body);
    const driftStatus = driftStatusResponse.json();
    assert.equal(
      driftStatus.modules.storyboard.upstream.upstreamChanged,
      true
    );
    assert.ok(
      driftStatus.modules.storyboard.upstream.changedSources.includes(
        "productBriefArtifactId"
      )
    );
    assert.equal(
      driftStatus.modules.shotprompt.upstream.upstreamChanged,
      true
    );
    assert.ok(
      driftStatus.modules.shotprompt.upstream.changedSources.includes(
        "productBriefArtifactId"
      )
    );

    await reapproveCurrentShotPrompt(app, workspaceId);
    const shotSetDriftResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`
    });
    assert.equal(shotSetDriftResponse.statusCode, 200, shotSetDriftResponse.body);
    assert.equal(
      shotSetDriftResponse.json().activeShotSet.upstream.upstreamChanged,
      true
    );
    assert.deepEqual(
      shotSetDriftResponse.json().activeShotSet.upstream.changedSources,
      ["shotPromptArtifactId"]
    );
  });

  it("keeps archived shot rows out of the active workflow path", async () => {
    const { workspaceId, shotIds: oldShotIds } =
      await seedApprovedShotPromptWorkspace(app, 2);
    const oldFirstShotId = oldShotIds[0];
    const oldSecondShotId = oldShotIds[1];
    assert.ok(oldFirstShotId);
    assert.ok(oldSecondShotId);

    await completeImageSelection(app, workspaceId, oldFirstShotId);
    await completeImageSelection(app, workspaceId, oldSecondShotId);

    const newShotPrompt = await reapproveCurrentShotPrompt(app, workspaceId);
    const newShotSetResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shot-sets`,
      payload: { shotPromptArtifactId: newShotPrompt.id }
    });
    assert.equal(newShotSetResponse.statusCode, 200, newShotSetResponse.body);

    const shotsResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shots`
    });
    assert.equal(shotsResponse.statusCode, 200, shotsResponse.body);
    const activeShots = shotsResponse.json().data as Array<{ id: string }>;
    assert.equal(activeShots.length, 2);
    assert.ok(!activeShots.some((shot) => oldShotIds.includes(shot.id)));
    const activeFirstShotId = activeShots[0]?.id;
    const activeSecondShotId = activeShots[1]?.id;
    assert.ok(activeFirstShotId);
    assert.ok(activeSecondShotId);

    const workflowResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/shot-workflow-status`
    });
    assert.equal(workflowResponse.statusCode, 200, workflowResponse.body);
    assert.equal(workflowResponse.json().data.shots.length, 2);
    assert.deepEqual(
      workflowResponse.json().data.shots.map((shot: { shotId: string }) => shot.shotId),
      [activeFirstShotId, activeSecondShotId]
    );
    assert.equal(workflowResponse.json().data.canComposeFinalVideo, false);

    const firstActiveImage = await completeImageSelection(
      app,
      workspaceId,
      activeFirstShotId
    );
    assert.equal(firstActiveImage.selection.allShotsImageSelected, false);
    assert.equal(firstActiveImage.selection.nextShotId, activeSecondShotId);

    const incompleteVideoResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${activeFirstShotId}/video-scripts/propose`,
      payload: {}
    });
    assert.equal(incompleteVideoResponse.statusCode, 400);
    assert.equal(incompleteVideoResponse.json().code, "IMAGE_SELECTION_INCOMPLETE");
    assert.match(incompleteVideoResponse.json().message, new RegExp(activeSecondShotId));
    assert.doesNotMatch(
      incompleteVideoResponse.json().message,
      new RegExp(oldFirstShotId)
    );

    const secondActiveImage = await completeImageSelection(
      app,
      workspaceId,
      activeSecondShotId
    );
    assert.equal(secondActiveImage.selection.allShotsImageSelected, true);

    const videoScriptResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${activeFirstShotId}/video-scripts/propose`,
      payload: {}
    });
    assert.equal(videoScriptResponse.statusCode, 200, videoScriptResponse.body);
    assert.equal(
      videoScriptResponse.json().frames.lastFrameCandidateId,
      secondActiveImage.imageCandidateId
    );
    assert.match(videoScriptResponse.json().context.voiceProfileHash, /^[a-f0-9]{64}$/);
    assert.equal(typeof videoScriptResponse.json().context.voiceover, "string");

    const archivedSelectResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${oldFirstShotId}/image-candidates/select`,
      payload: { candidateId: firstActiveImage.imageCandidateId }
    });
    assert.equal(archivedSelectResponse.statusCode, 400);
    assert.equal(archivedSelectResponse.json().code, "SHOT_NOT_IN_ACTIVE_SET");
  });

  it("keeps directly managed material files resolvable when applying a shot set", async () => {
    const { workspaceId } = await seedApprovedShotPromptWorkspace(app, 1, {
      registerMaterialAsset: false
    });

    const result = await db.db2.pool().query(
      `select a.metadata
       from asset a
       join shot_asset_refs sar on sar.asset_id = a.id
       join storyboard_shots s on s.id = sar.shot_id
       where s.workspace_id = $1
       order by sar.position
       limit 1`,
      [workspaceId]
    );
    const metadata = result.rows[0]?.metadata as Record<string, unknown> | undefined;
    assert.equal(metadata?.ref, "product.png");
    assert.equal(metadata?.contentType, "image/png");
    assert.match(String(metadata?.storagePath ?? ""), /product\.png$/);
  });
});
