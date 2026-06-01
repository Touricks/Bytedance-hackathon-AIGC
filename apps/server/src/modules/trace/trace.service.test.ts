import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";
import { traceService } from "./trace.service.js";

const cleanupDirs: string[] = [];

async function createBoundWorkspace(app: FastifyInstance) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: { name: `trace-mirror-${Date.now()}` },
  });
  assert.equal(createResponse.statusCode, 200, createResponse.body);
  const workspace = createResponse.json().workspace as {
    id: string;
    currentScriptId: string;
  };

  const directory = await mkdtemp(path.join(os.tmpdir(), "trace-mirror-"));
  cleanupDirs.push(directory);
  const bindResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/storage/bind`,
    payload: { kind: "local", localPath: directory },
  });
  assert.equal(bindResponse.statusCode, 200, bindResponse.body);

  return {
    workspaceId: workspace.id,
    currentScriptId: workspace.currentScriptId,
    directory,
  };
}

describe("trace service", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
    await Promise.all(
      cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("mirrors shot trace records into the workspace-local trace file", async () => {
    const { workspaceId, currentScriptId, directory } =
      await createBoundWorkspace(app);
    const shotId = `shot_${Date.now()}`;
    await db.db2.insertShot({
      id: shotId,
      workspaceId,
      scriptId: currentScriptId,
      orderIndex: 0,
      title: "Trace mirror shot",
      objective: "Verify shot-level trace mirroring",
      defaultDurationSec: 4,
      status: "DRAFT",
      nextAction: null,
      activeImagePromptArtifactId: null,
      selectedImageId: null,
      activeVideoScriptArtifactId: null,
      selectedVideoId: null,
      lastError: null,
    });

    await traceService.record({
      workspaceId,
      shotId,
      traceType: "agent_run",
      name: "image_prompt_proposed",
      inputPreview: "selected product image",
      outputPreview: "render a clean ecommerce still",
      metadata: {
        promptAssembly: {
          subjectHash: "a".repeat(64),
          contractHash: "b".repeat(64),
        },
      },
    });

    const tracePath = path.join(directory, ".daireel", "trace", "events.jsonl");
    const raw = await readFile(tracePath, "utf8");
    const events = raw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.workspaceId, workspaceId);
    assert.equal(events[0]?.shotId, shotId);
    assert.equal(events[0]?.kind, "image_prompt_proposed");
    assert.equal(events[0]?.pipeline, "shot_image");
    assert.equal(events[0]?.status, "ok");
    assert.deepEqual(
      (events[0]?.meta as Record<string, unknown>)?.promptAssembly,
      {
        subjectHash: "a".repeat(64),
        contractHash: "b".repeat(64),
      },
    );
  });
});
