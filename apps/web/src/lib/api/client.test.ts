import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  approveWorkspaceBrief,
  createWorkspace,
  createGenerationJob,
  getWorkspaceStatus,
  listWorkspaces,
  runWorkspaceMaterialIntake,
  selectWorkspaceDirectory,
  uploadWorkspaceMaterial,
  uploadProductImage
} from "./client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("api client", () => {
  it("surfaces product image upload validation failures as readable errors", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          statusCode: 400,
          message: "Uploaded product image must be a valid image file"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );

    const file = new File(["fake image bytes"], "fake-product.png", {
      type: "image/png"
    });

    await assert.rejects(
      () => uploadProductImage(file),
      /Uploaded product image must be a valid image file/
    );
  });

  it("creates a generation job from scriptId and returns hydrated job detail", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "http://localhost:3000/api/creation/jobs");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { scriptId: "script_123" });

      return new Response(
        JSON.stringify({
          job: {
            id: "job_123",
            productId: "product_123",
            scriptId: "script_123",
            status: "queued",
            stage: "queued",
            progress: 0,
            payload: { scriptId: "script_123" },
            trace: [],
            createdAt: "2026-05-23T00:00:00.000Z",
            updatedAt: "2026-05-23T00:00:00.000Z"
          },
          script: {
            id: "script_123",
            productId: "product_123",
            version: 1,
            narrative: "A short product story",
            visualStyle: "clean",
            frozen: true,
            rawJson: {},
            createdAt: "2026-05-23T00:00:00.000Z"
          },
          shots: []
        }),
        { status: 200 }
      );
    };

    const detail = await createGenerationJob({ scriptId: "script_123" });

    assert.equal(detail.job.id, "job_123");
    assert.equal(detail.job.scriptId, "script_123");
    assert.equal(detail.script?.id, "script_123");
    assert.deepEqual(detail.shots, []);
  });

  it("runs workspace status and material intake by workspaceId", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      assert.equal(init?.method, "POST");
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });

      return new Response(
        JSON.stringify({
          workspace: {
            id: "workspace_123",
            localPath: "/tmp/desk-demo",
            currentScriptId: "script_123",
            status: "materials_ready",
            traceFile: ".daireel/trace/events.jsonl",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
            lastSeenAt: "2026-05-25T00:00:00.000Z"
          },
          artifact: {
            id: "artifact_123",
            workspaceId: "workspace_123",
            scriptId: "script_123",
            type: "assets",
            status: "approved",
            data: {
              scannedAt: "2026-05-25T00:00:00.000Z",
              primaryProductRef: "product.png",
              assets: [],
              rejected: []
            },
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        }),
        { status: 200 }
      );
    };

    const status = await getWorkspaceStatus("workspace_123");
    const detail = await runWorkspaceMaterialIntake({
      workspaceId: "workspace_123",
      prompt: "office UGC",
      selectedMaterialRefs: ["product.png"]
    });

    assert.equal(status.workspace.id, "workspace_123");
    assert.equal(detail.workspace.currentScriptId, "script_123");
    assert.equal(detail.artifact.type, "assets");
    assert.deepEqual(calls, [
      {
        url: "http://localhost:3000/api/workspaces/status",
        body: { workspaceId: "workspace_123" }
      },
      {
        url: "http://localhost:3000/api/workspaces/material-intake",
        body: {
          workspaceId: "workspace_123",
          prompt: "office UGC",
          selectedMaterialRefs: ["product.png"]
        }
      }
    ]);
  });

  it("creates and lists Fastify-managed workspaces", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (String(url).endsWith("/api/workspaces") && init?.method === "POST") {
        assert.deepEqual(JSON.parse(String(init.body)), { name: "Desk Demo" });
        return new Response(
          JSON.stringify({
            workspace: {
              id: "workspace_123",
              localPath: "/tmp/uploads/workspaces/desk-demo-workspace_123",
              currentScriptId: "script_123",
              status: "draft",
              traceFile: ".daireel/trace/events.jsonl",
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-25T00:00:00.000Z"
            },
            manifest: {
              schemaVersion: 1,
              workspaceId: "workspace_123",
              currentScriptId: "script_123",
              traceFile: ".daireel/trace/events.jsonl"
            }
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          workspaceRoot: "/tmp/uploads/workspaces",
          workspaces: [
            {
              id: "workspace_123",
              localPath: "/tmp/uploads/workspaces/desk-demo-workspace_123",
              currentScriptId: "script_123",
              status: "draft",
              traceFile: ".daireel/trace/events.jsonl",
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-25T00:00:00.000Z"
            }
          ]
        }),
        { status: 200 }
      );
    };

    const created = await createWorkspace("Desk Demo");
    const listed = await listWorkspaces();

    assert.equal(created.workspace.id, "workspace_123");
    assert.equal(listed.workspaceRoot, "/tmp/uploads/workspaces");
    assert.equal(listed.workspaces[0]?.id, "workspace_123");
    assert.deepEqual(calls, [
      "POST http://localhost:3000/api/workspaces",
      "GET http://localhost:3000/api/workspaces"
    ]);
  });

  it("opens the Fastify workspace directory picker", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/directory/select"
      );
      assert.equal(init?.method, "POST");

      return new Response(
        JSON.stringify({
          directory: "/tmp/project-workspace",
          cancelled: false,
          method: "macos"
        }),
        { status: 200 }
      );
    };

    const selected = await selectWorkspaceDirectory();

    assert.deepEqual(selected, {
      directory: "/tmp/project-workspace",
      cancelled: false,
      method: "macos"
    });
  });

  it("uploads files to a Fastify-managed workspace", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "http://localhost:3000/api/workspaces/materials");
      assert.equal(init?.method, "POST");
      assert.equal(init?.body instanceof FormData, true);
      const body = init?.body as FormData;
      assert.equal(body.get("workspaceId"), "workspace_123");
      const file = body.get("file");
      assert.equal(file instanceof File, true);
      assert.equal((file as File).name, "notes.txt");
      assert.equal(await (file as File).text(), "hello workspace");

      return new Response(
        JSON.stringify({
          workspace: {
            id: "workspace_123",
            localPath: "/tmp/uploads/workspaces/desk-demo-workspace_123",
            currentScriptId: "script_123",
            status: "draft",
            traceFile: ".daireel/trace/events.jsonl",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
            lastSeenAt: "2026-05-25T00:00:00.000Z"
          },
          material: {
            ref: "notes.txt",
            bytes: 15,
            url: "/uploads/workspace-materials/workspace_123/notes.txt"
          }
        }),
        { status: 200 }
      );
    };

    const uploaded = await uploadWorkspaceMaterial({
      workspaceId: "workspace_123",
      file: new File(["hello workspace"], "notes.txt", { type: "text/plain" })
    });

    assert.equal(uploaded.material.ref, "notes.txt");
    assert.equal(uploaded.material.bytes, 15);
  });

  it("surfaces workspace material upload validation failures as readable errors", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          statusCode: 400,
          message: "Material file exceeds 50MB limit"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );

    await assert.rejects(
      () =>
        uploadWorkspaceMaterial({
          workspaceId: "workspace_123",
          file: new File(["too large"], "large.txt", { type: "text/plain" })
        }),
      /Material file exceeds 50MB limit/
    );
  });

  it("does not surface raw Zod issue JSON to form users", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          statusCode: 400,
          message: JSON.stringify([
            {
              code: "too_small",
              path: ["data", "shots", 0, "voiceover"],
              message: "String must contain at least 1 character(s)"
            }
          ])
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );

    await assert.rejects(
      () =>
        approveWorkspaceBrief("workspace_123", {
          product: {
            name: "",
            category: "",
            keyFacts: [],
            assets: []
          },
          audience: {
            who: "",
            painOrDesire: ""
          },
          coreSellingPoint: "",
          proof: [],
          offer: null,
          platform: "",
          brandTone: "",
          bannedExpressions: [],
          landingInfo: null,
          assumptions: []
        }),
      /请检查表单字段后重试/
    );
  });

  it("approves workspace brief artifacts through the V1 approval API", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/artifacts/brief/approve"
      );
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body)) as {
        workspaceId: string;
        data: { coreSellingPoint: string };
      };
      assert.equal(body.workspaceId, "workspace_123");
      assert.equal(body.data.coreSellingPoint, "easy cleaning");

      return new Response(
        JSON.stringify({
          workspace: {
            id: "workspace_123",
            localPath: "/tmp/desk-demo",
            currentScriptId: "script_123",
            status: "brief_approved",
            traceFile: ".daireel/trace/events.jsonl",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
            lastSeenAt: "2026-05-25T00:00:00.000Z"
          },
          artifact: {
            id: "artifact_456",
            workspaceId: "workspace_123",
            scriptId: "script_123",
            type: "brief",
            status: "approved",
            data: body.data,
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
            approvedAt: "2026-05-25T00:00:00.000Z"
          }
        }),
        { status: 200 }
      );
    };

    const detail = await approveWorkspaceBrief("workspace_123", {
      product: {
        name: "Mini Blender",
        category: "portable blender",
        keyFacts: ["USB-C"],
        assets: [{ ref: "product.png", useAs: "primary" }]
      },
      audience: {
        who: "office workers",
        painOrDesire: "quick smoothies"
      },
      coreSellingPoint: "easy cleaning",
      proof: ["product image"],
      offer: null,
      platform: "Seedance",
      brandTone: "clean",
      bannedExpressions: [],
      landingInfo: null,
      assumptions: []
    });

    assert.equal(detail.workspace.status, "brief_approved");
    assert.equal(detail.artifact.status, "approved");
  });
});
