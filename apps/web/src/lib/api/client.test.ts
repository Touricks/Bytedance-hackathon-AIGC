import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  approveWorkspacePromptRequirements,
  approveWorkspaceBrief,
  createWorkspace,
  getWorkspaceStatus,
  listWorkspaces,
  proposeWorkspacePromptRequirements,
  runWorkspaceMaterialIntake,
  selectWorkspaceDirectory,
  toWorkspaceMaterialUrl,
  uploadWorkspaceMaterial,
  uploadProductImage
} from "./client.js";

const originalFetch = globalThis.fetch;

function moduleArtifact(moduleId: string, data: unknown, status = "proposed") {
  return {
    id: `${moduleId}_artifact_123`,
    workspaceId: "workspace_123",
    moduleId,
    type: moduleId,
    status,
    isCurrent: status === "approved",
    data,
    sourceFingerprint: {},
    promptAssembly: {
      moduleId,
      assemblerVersion: "v2",
      subjectHash: "a".repeat(64),
      contractHash: "b".repeat(64)
    },
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    approvedAt: status === "approved" ? "2026-05-25T00:00:00.000Z" : null
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("api client", () => {
  it("builds workspace material URLs from bare asset refs", () => {
    assert.equal(
      toWorkspaceMaterialUrl("workspace_123", "DSC03391.JPG"),
      "http://localhost:3000/api/workspaces/workspace_123/materials/DSC03391.JPG"
    );
    assert.equal(
      toWorkspaceMaterialUrl("workspace_123", "folder/product image.png"),
      "http://localhost:3000/api/workspaces/workspace_123/materials/folder/product%20image.png"
    );
    assert.equal(
      toWorkspaceMaterialUrl(
        "workspace_123",
        "/api/workspaces/workspace_123/materials/product.png"
      ),
      "http://localhost:3000/api/workspaces/workspace_123/materials/product.png"
    );
  });

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

  it("runs workspace status and material intake by workspaceId", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
      const materialData = {
        scannedAt: "2026-05-25T00:00:00.000Z",
        primaryProductRef: "product.png",
        assets: [],
        rejected: []
      };

      return new Response(
        JSON.stringify(
          String(url).endsWith("/status")
            ? {
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
                artifacts: {
                  material: moduleArtifact(
                    "material-intake",
                    materialData,
                    "approved"
                  ),
                  brief: null,
                  storyboard: null,
                  shotPrompt: null
                }
              }
            : {
                data: moduleArtifact("material-intake", materialData)
              }
        ),
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
    assert.equal(status.artifacts?.material?.moduleId, "material-intake");
    assert.equal(detail.artifact.moduleId, "material-intake");
    assert.deepEqual(calls, [
      {
        method: "GET",
        url: "http://localhost:3000/api/workspaces/workspace_123/status",
        body: null
      },
      {
        method: "POST",
        url: "http://localhost:3000/api/workspaces/workspace_123/material-intake/propose",
        body: {
          userDirection: "office UGC",
          selectedMaterialRefs: ["product.png"]
        }
      }
    ]);
  });

  it("proposes and approves prompt requirements by workspaceId", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const status = String(url).endsWith("/approve") ? "approved" : "proposed";
      return new Response(
        JSON.stringify({
          data: moduleArtifact(
            "prompt-requirements",
            body.data ?? {
              image: { style: "clean" },
              shotImage: { global: "consistent scene" },
              shotVideo: { global: "smooth motion" }
            },
            status
          )
        }),
        { status: 200 }
      );
    };

    const proposed = await proposeWorkspacePromptRequirements({
      workspaceId: "workspace_123",
      data: {
        image: { style: "clean" },
        shotImage: { global: "consistent scene" },
        shotVideo: { global: "smooth motion" }
      }
    });
    const approved = await approveWorkspacePromptRequirements({
      workspaceId: "workspace_123",
      artifactId: proposed.artifact.id
    });

    assert.equal(proposed.artifact.moduleId, "prompt-requirements");
    assert.equal(approved.artifact.isCurrent, true);
    assert.deepEqual(calls, [
      {
        method: "POST",
        url: "http://localhost:3000/api/workspaces/workspace_123/prompt-requirements/propose",
        body: {
          data: {
            image: { style: "clean" },
            shotImage: { global: "consistent scene" },
            shotVideo: { global: "smooth motion" }
          }
        }
      },
      {
        method: "POST",
        url: "http://localhost:3000/api/workspaces/workspace_123/prompt-requirements/approve",
        body: { artifactId: "prompt-requirements_artifact_123" }
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
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/materials"
      );
      assert.equal(init?.method, "POST");
      assert.equal(init?.body instanceof FormData, true);
      const body = init?.body as FormData;
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
            url: "/api/workspaces/workspace_123/materials/notes.txt"
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

  it("approves workspace brief artifacts through the V2 module API", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/product-brief/approve"
      );
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body)) as {
        data: { coreSellingPoint: string };
      };
      assert.equal(body.data.coreSellingPoint, "easy cleaning");

      return new Response(
        JSON.stringify({
          data: moduleArtifact("product-brief", body.data, "approved")
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

    assert.equal(detail.artifact.moduleId, "product-brief");
    assert.equal(detail.artifact.status, "approved");
  });
});
