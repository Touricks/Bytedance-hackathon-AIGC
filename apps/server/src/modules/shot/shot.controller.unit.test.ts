import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import Fastify from "fastify";
import { registerShotController } from "./shot.controller.js";
import { shotWorkflowService } from "./shot.service.js";

const originalProposeImagePrompt = shotWorkflowService.proposeImagePrompt;
const originalRegenerateImagePrompt = shotWorkflowService.regenerateImagePrompt;
const originalProposeVideoScript = shotWorkflowService.proposeVideoScript;
const originalRegenerateVideoScript = shotWorkflowService.regenerateVideoScript;

afterEach(() => {
  shotWorkflowService.proposeImagePrompt = originalProposeImagePrompt;
  shotWorkflowService.regenerateImagePrompt = originalRegenerateImagePrompt;
  shotWorkflowService.proposeVideoScript = originalProposeVideoScript;
  shotWorkflowService.regenerateVideoScript = originalRegenerateVideoScript;
});

async function buildShotControllerApp() {
  const app = Fastify({ logger: false });
  await registerShotController(app);
  return app;
}

describe("shot controller candidateCount contract", () => {
  it("passes candidateCount to image prompt propose and regenerate services", async () => {
    const seen: unknown[] = [];
    shotWorkflowService.proposeImagePrompt = (async (args: unknown) => {
      seen.push(args);
      return { data: { id: "img_propose" } };
    }) as typeof shotWorkflowService.proposeImagePrompt;
    shotWorkflowService.regenerateImagePrompt = (async (args: unknown) => {
      seen.push(args);
      return { data: { id: "img_regenerate" } };
    }) as typeof shotWorkflowService.regenerateImagePrompt;
    const app = await buildShotControllerApp();

    await app.inject({
      method: "POST",
      url: "/api/workspaces/ws-1/shots/shot-1/image-prompts/propose",
      payload: { userDirection: "更清晰", candidateCount: 4 },
    });
    await app.inject({
      method: "POST",
      url: "/api/workspaces/ws-1/shots/shot-1/image-prompts/regenerate",
      payload: {
        baseArtifactId: "art-img-1",
        feedbackImageCandidateId: "imc-1",
        userDirection: "入口更亮",
        candidateCount: 5,
      },
    });

    await app.close();
    assert.deepEqual(seen, [
      {
        workspaceId: "ws-1",
        shotId: "shot-1",
        userDirection: "更清晰",
        candidateCount: 4,
      },
      {
        workspaceId: "ws-1",
        shotId: "shot-1",
        baseArtifactId: "art-img-1",
        feedbackImageCandidateId: "imc-1",
        userDirection: "入口更亮",
        candidateCount: 5,
      },
    ]);
  });

  it("passes candidateCount to video script propose and regenerate services", async () => {
    const seen: unknown[] = [];
    shotWorkflowService.proposeVideoScript = (async (args: unknown) => {
      seen.push(args);
      return { data: { id: "vid_propose" } };
    }) as typeof shotWorkflowService.proposeVideoScript;
    shotWorkflowService.regenerateVideoScript = (async (args: unknown) => {
      seen.push(args);
      return { data: { id: "vid_regenerate" } };
    }) as typeof shotWorkflowService.regenerateVideoScript;
    const app = await buildShotControllerApp();

    await app.inject({
      method: "POST",
      url: "/api/workspaces/ws-1/shots/shot-1/video-scripts/propose",
      payload: { userDirection: "节奏更稳", candidateCount: 3 },
    });
    await app.inject({
      method: "POST",
      url: "/api/workspaces/ws-1/shots/shot-1/video-scripts/regenerate",
      payload: {
        baseArtifactId: "art-vid-1",
        feedbackVideoCandidateId: "vcd-1",
        userDirection: "镜头慢一点",
        candidateCount: 2,
      },
    });

    await app.close();
    assert.deepEqual(seen, [
      {
        workspaceId: "ws-1",
        shotId: "shot-1",
        userDirection: "节奏更稳",
        candidateCount: 3,
      },
      {
        workspaceId: "ws-1",
        shotId: "shot-1",
        baseArtifactId: "art-vid-1",
        feedbackVideoCandidateId: "vcd-1",
        userDirection: "镜头慢一点",
        candidateCount: 2,
      },
    ]);
  });
});
