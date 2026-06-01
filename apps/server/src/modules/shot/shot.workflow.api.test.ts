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
  options: { registerMaterialAsset?: boolean } = {},
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
  assert.equal(requirementsProposeResponse.statusCode, 200, requirementsProposeResponse.body);
  const requirementsApproveResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/prompt-requirements/approve`,
    payload: { artifactId: requirementsProposeResponse.json().data.id }
  });
  assert.equal(requirementsApproveResponse.statusCode, 200, requirementsApproveResponse.body);

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
    shotIds: shots.map((item) => item.id),
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

  it("keeps refresh-resumable batch ids and writes image/video selections to V2 tables", async () => {
    const { workspaceId, shotId } = await seedApprovedShotPromptWorkspace(app);

    const imagePromptResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`,
      payload: {}
    });
    assert.equal(imagePromptResponse.statusCode, 200, imagePromptResponse.body);
    const imagePromptId = imagePromptResponse.json().data.id as string;
    assertPromptAssembly(
      imagePromptResponse.json().data.promptAssembly,
      "image-prompt",
    );
    const imageBatchId = imagePromptResponse.json().batch.id as string;
    const imageCandidates = imagePromptResponse.json().candidates as Array<{
      id: string;
      imageUrl: string | null;
      status: string;
    }>;
    assert.equal(imagePromptResponse.json().shotStatus, "IMAGE_GENERATING");
    assert.equal(imageCandidates.length, config.defaultImageBatchSize);
    assert.ok(
      imageCandidates.every((candidate) => candidate.status === "PENDING"),
      "image candidates should be queued as individual jobs",
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
        objectKey: `materials/generated-images/${candidate.id}.png`,
      });
    }
    await db.db2.updateImageBatch(imageBatchId, {
      status: "SUCCEEDED",
      succeededCount: imageCandidates.length,
      failedCount: 0,
    });
    await db.db2.updateShot(shotId, { status: "IMAGE_CANDIDATES_READY" });
    const completedImageCandidates =
      await db.db2.listImageCandidatesByBatch(imageBatchId);
    const imageCandidate = completedImageCandidates.find((candidate) => candidate.status === "SUCCEEDED" && candidate.imageUrl);
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
    assertPromptAssembly(activeImagePrompt.promptAssembly, "image-prompt");

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
      payload: {}
    });
    assert.equal(videoScriptResponse.statusCode, 200, videoScriptResponse.body);
    assertPromptAssembly(
      videoScriptResponse.json().data.promptAssembly,
      "video-script",
    );
    const videoBatchId = videoScriptResponse.json().batch.id as string;
    const videoCandidates = videoScriptResponse.json().candidates as Array<{
      id: string;
      videoUrl: string | null;
      status: string;
    }>;
    assert.equal(videoScriptResponse.json().shotStatus, "VIDEO_CANDIDATES_READY");
    assert.equal(videoCandidates.length, config.defaultVideoBatchSize);
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
    assert.equal(videoStatusShot.activeImageBatchId, imageBatchId);
    assert.equal(videoStatusShot.activeVideoBatchId, videoBatchId);

    const videoCandidate = videoCandidates.find((candidate) => candidate.status === "SUCCEEDED" && candidate.videoUrl);
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
       from video_select_artifacts
       where shot_id = $1`,
      [shotId]
    );
    assert.equal(selectedVideoResult.rows[0]?.video_candidate_id, videoCandidate.id);
    assert.equal(selectedVideoResult.rows[0]?.video_generation_batch_id, videoBatchId);

    const traceResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/traces?limit=100`,
    });
    assert.equal(traceResponse.statusCode, 200, traceResponse.body);
    const traceNames = new Set(
      (traceResponse.json() as Array<{ name: string; shotId?: string }>)
        .filter((event) => event.shotId === shotId)
        .map((event) => event.name),
    );
    const missingTraceEvents = [
      "image_prompt_proposed",
      "image_candidate_selected",
      "video_script_proposed",
      "video_generation_completed",
      "video_candidate_selected",
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
        objectKey: `materials/generated-images/${candidate.id}.png`,
      });
    }
    await db.db2.updateImageBatch(imageBatchId, {
      status: "SUCCEEDED",
      succeededCount: imageCandidates.length,
      failedCount: 0,
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

  it("keeps directly managed material files resolvable when applying a shot set", async () => {
    const { workspaceId } = await seedApprovedShotPromptWorkspace(app, 1, {
      registerMaterialAsset: false,
    });

    const result = await db.db2.pool().query(
      `select a.metadata
       from asset a
       join shot_asset_refs sar on sar.asset_id = a.id
       join storyboard_shots s on s.id = sar.shot_id
       where s.workspace_id = $1
       order by sar.position
       limit 1`,
      [workspaceId],
    );
    const metadata = result.rows[0]?.metadata as
      | Record<string, unknown>
      | undefined;
    assert.equal(metadata?.ref, "product.png");
    assert.equal(metadata?.contentType, "image/png");
    assert.match(String(metadata?.storagePath ?? ""), /product\.png$/);
  });
});
