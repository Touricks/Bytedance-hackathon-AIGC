import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { ProductBriefArtifact, StoryboardArtifact } from "@aigc-video/shared";
import {
  approveWorkspacePromptRequirements,
  approveWorkspaceBrief,
  createWorkspace,
  deleteWorkspace,
  deleteWorkspaceMaterial,
  getWorkspaceStatus,
  importReferenceVideoRequirements,
  listCreativeRequirementTemplates,
  listWorkspaces,
  proposeWorkspaceBrief,
  proposeWorkspaceStoryboardVoiceover,
  proposeWorkspacePromptRequirements,
  runWorkspaceMaterialIntake,
  selectWorkspaceDirectory,
  toWorkspaceMaterialUrl,
  uploadWorkspaceMaterial,
  uploadProductImage,
  workspaceMaterialFileRejectionReason
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
    promptAssembly: { moduleId },
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    approvedAt: status === "approved" ? "2026-05-25T00:00:00.000Z" : null
  };
}

const sampleProductBrief: ProductBriefArtifact = {
  product: {
    name: "山茶花修护精华油",
    category: "护肤",
    keyFacts: ["山茶花籽油", "换季修护"],
    assets: [{ ref: "product.png", useAs: "primary" }]
  },
  audience: {
    who: "换季干燥肌用户",
    painOrDesire: "想缓解干燥起皮"
  },
  coreSellingPoint: "山茶花籽油亲肤修护",
  proof: ["主图展示产品包装和油体质感"],
  offer: "下单立减",
  platform: "抖音",
  brandTone: "真实直接",
  bannedExpressions: [],
  landingInfo: null,
  assumptions: []
};

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

  it("lists creative requirement templates from setup template API", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url)
      });
      return new Response(
        JSON.stringify({
          data: {
            templates: [
              {
                id: "consumer-electronics-search-youth-review",
                name: "3C数码 · 搜索测评 · 青年",
                summary: "面向青年用户的搜索型 3C 标品测评组合。",
                version: "factor-preset.2026-06",
                creativeFactors: {
                  productCategory: "consumer-electronics",
                  dealType: "search-standard",
                  audience: "youth",
                  strategy: "review-comparison"
                }
              }
            ]
          }
        }),
        { status: 200 }
      );
    };

    const detail = await listCreativeRequirementTemplates();

    assert.equal(detail.templates[0]?.id, "consumer-electronics-search-youth-review");
    assert.equal(detail.templates[0]?.creativeFactors.productCategory, "consumer-electronics");
    assert.equal("values" in detail.templates[0]!, false);
    assert.deepEqual(calls, [
      {
        method: "GET",
        url: "http://localhost:3000/api/setup-templates/creative-requirements"
      }
    ]);
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
                  material: moduleArtifact("material-intake", materialData, "approved"),
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

  it("prefers regenerated proposed material intake over the old current artifact", async () => {
    const currentMaterial = moduleArtifact(
      "material-intake",
      {
        scannedAt: "2026-05-25T00:00:00.000Z",
        primaryProductRef: "old-product.png",
        assets: [{ ref: "old-product.png", description: "旧素材解读" }],
        rejected: []
      },
      "approved"
    );
    const proposedMaterial = {
      ...moduleArtifact("material-intake", {
        scannedAt: "2026-05-26T00:00:00.000Z",
        primaryProductRef: "new-product.png",
        assets: [{ ref: "new-product.png", description: "重新生成的素材解读" }],
        rejected: []
      }),
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z"
    };

    globalThis.fetch = async () =>
      new Response(
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
          modules: {
            "material-intake": {
              moduleId: "material-intake",
              proposed: proposedMaterial,
              current: currentMaterial
            }
          },
          artifacts: {
            material: currentMaterial,
            brief: null,
            storyboard: null,
            shotPrompt: null
          }
        }),
        { status: 200 }
      );

    const status = await getWorkspaceStatus("workspace_123");

    assert.equal(status.artifacts?.material?.id, proposedMaterial.id);
    assert.equal(status.artifacts?.material?.isCurrent, false);
    assert.equal(
      status.artifacts?.material?.data.assets[0]?.description,
      "重新生成的素材解读"
    );
  });

  it("keeps the approved material intake current when it is newer than a lingering proposal", async () => {
    const proposedMaterial = {
      ...moduleArtifact(
        "material-intake",
        {
          scannedAt: "2026-05-25T00:00:00.000Z",
          primaryProductRef: "old-product.png",
          assets: [{ ref: "old-product.png", description: "待审核素材解读" }],
          rejected: []
        },
        "proposed"
      ),
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    };
    const currentMaterial = {
      ...moduleArtifact(
        "material-intake",
        {
          scannedAt: "2026-05-26T00:00:00.000Z",
          primaryProductRef: "approved-product.png",
          assets: [{ ref: "approved-product.png", description: "已批准素材解读" }],
          rejected: []
        },
        "approved"
      ),
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
      approvedAt: "2026-05-26T00:00:00.000Z"
    };

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          workspace: {
            id: "workspace_123",
            localPath: "/tmp/desk-demo",
            currentScriptId: "script_123",
            status: "brief_proposed",
            traceFile: ".daireel/trace/events.jsonl",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-26T00:00:00.000Z",
            lastSeenAt: "2026-05-26T00:00:00.000Z"
          },
          modules: {
            "material-intake": {
              moduleId: "material-intake",
              proposed: proposedMaterial,
              current: currentMaterial
            }
          },
          artifacts: {
            material: currentMaterial,
            brief: null,
            storyboard: null,
            shotPrompt: null
          }
        }),
        { status: 200 }
      );

    const status = await getWorkspaceStatus("workspace_123");

    assert.equal(status.artifacts?.material?.id, currentMaterial.id);
    assert.equal(status.artifacts?.material?.isCurrent, true);
    assert.equal(
      status.artifacts?.material?.data.assets[0]?.description,
      "已批准素材解读"
    );
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

  it("proposes product brief rewrites with draft and merchant direction", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
      return new Response(
        JSON.stringify({
          data: moduleArtifact("product-brief", {
            ...sampleProductBrief,
            coreSellingPoint: "更适合送礼的年轻化修护卖点"
          })
        }),
        { status: 200 }
      );
    };

    const proposed = await proposeWorkspaceBrief({
      workspaceId: "workspace_123",
      baseArtifactId: "brief_current_123",
      userDirection: "更突出送礼场景，语气更年轻",
      draft: sampleProductBrief
    });

    assert.equal(proposed.artifact.moduleId, "product-brief");
    assert.equal(proposed.artifact.data.coreSellingPoint, "更适合送礼的年轻化修护卖点");
    assert.deepEqual(calls, [
      {
        method: "POST",
        url: "http://localhost:3000/api/workspaces/workspace_123/product-brief/propose",
        body: {
          userDirection: "更突出送礼场景，语气更年轻",
          draft: sampleProductBrief,
          baseArtifactId: "brief_current_123"
        }
      }
    ]);
  });

  it("proposes storyboard voiceover rewrites through the server", async () => {
    const calls: unknown[] = [];
    const draft: StoryboardArtifact = {
      narrative: "三镜商品口播",
      totalDurationSec: 15,
      shots: [
        {
          index: 0,
          purpose: "hook",
          durationSec: 4,
          scene: "开场痛点",
          visualDirection: "真实场景",
          productAssetRef: "product.png",
          voiceover: "旧开场",
          transition: "cut"
        },
        {
          index: 1,
          purpose: "proof",
          durationSec: 7,
          scene: "卖点证明",
          visualDirection: "产品展示",
          productAssetRef: "product.png",
          voiceover: "旧卖点",
          transition: "cut"
        },
        {
          index: 2,
          purpose: "cta",
          durationSec: 4,
          scene: "行动号召",
          visualDirection: "利益点同屏",
          productAssetRef: "product.png",
          voiceover: "旧行动",
          transition: "fade"
        }
      ],
      assumptions: []
    };
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
      return new Response(
        JSON.stringify({
          data: moduleArtifact("storyboard", {
            ...draft,
            shots: draft.shots.map((shot) => ({
              ...shot,
              voiceover: `新${shot.voiceover}`
            }))
          })
        }),
        { status: 200 }
      );
    };

    const proposed = await proposeWorkspaceStoryboardVoiceover({
      workspaceId: "workspace_123",
      baseArtifactId: "storyboard_current_123",
      draft,
      userDirection: "更像真实口播"
    });

    assert.equal(proposed.artifact.moduleId, "storyboard");
    assert.equal(proposed.artifact.data.shots[0]?.voiceover, "新旧开场");
    assert.deepEqual(calls, [
      {
        method: "POST",
        url: "http://localhost:3000/api/workspaces/workspace_123/storyboard/voiceover/propose",
        body: {
          baseArtifactId: "storyboard_current_123",
          draft,
          userDirection: "更像真实口播"
        }
      }
    ]);
  });

  it("imports reference video requirements from a URL and returns the proposed artifact", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        headers: init?.headers,
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
      return new Response(
        JSON.stringify({
          data: {
            source: {
              type: "url",
              url: "https://cdn.example.com/reference.mp4",
              downloaded: true,
              contentType: "video/mp4",
              sizeBytes: 16
            },
            analysis: {
              summary: "参考视频采用快节奏卖点证明结构。",
              confidence: "medium"
            },
            creativeFactorsRecommendation: {
              recommendedFactors: {
                productCategory: "food-beverage",
                dealType: "search-standard",
                audience: "youth",
                strategy: "scenario-demo"
              },
              confidence: "medium"
            },
            artifact: {
              id: "prompt_req_123",
              workspaceId: "workspace_123",
              moduleId: "prompt-requirements",
              type: "prompt-requirements",
              status: "proposed",
              isCurrent: false,
              data: {
                creativeFactors: {
                  productCategory: "food-beverage",
                  dealType: "search-standard",
                  audience: "youth",
                  strategy: "scenario-demo"
                }
              },
              sourceFingerprint: {},
              promptAssembly: {},
              createdAt: "2026-06-06T00:00:00.000Z",
              updatedAt: "2026-06-06T00:00:00.000Z",
              approvedAt: null
            }
          }
        }),
        { status: 200 }
      );
    };

    const imported = await importReferenceVideoRequirements({
      workspaceId: "workspace_123",
      source: {
        type: "url",
        url: "https://cdn.example.com/reference.mp4"
      }
    });

    assert.equal(imported.analysis.summary, "参考视频采用快节奏卖点证明结构。");
    assert.equal(imported.artifact.status, "proposed");
    assert.equal("draft" in imported, false);
    assert.deepEqual(imported.creativeFactorsRecommendation.recommendedFactors, {
      productCategory: "food-beverage",
      dealType: "search-standard",
      audience: "youth",
      strategy: "scenario-demo"
    });
    assert.deepEqual(calls, [
      {
        method: "POST",
        url: "http://localhost:3000/api/workspaces/workspace_123/reference-video/import",
        headers: { "Content-Type": "application/json" },
        body: {
          source: {
            type: "url",
            url: "https://cdn.example.com/reference.mp4"
          }
        }
      }
    ]);
  });

  it("imports reference video requirements from an uploaded file", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        bodyIsFormData: init?.body instanceof FormData,
        headers: init?.headers ?? null
      });
      return new Response(
        JSON.stringify({
          data: {
            source: {
              type: "file",
              filename: "reference.mp4",
              contentType: "video/mp4",
              sizeBytes: 16
            },
            analysis: {
              summary: "参考视频采用快节奏卖点证明结构。",
              confidence: "medium"
            },
            creativeFactorsRecommendation: {
              recommendedFactors: {
                productCategory: "food-beverage",
                dealType: "search-standard",
                audience: "youth",
                strategy: "scenario-demo"
              },
              confidence: "medium"
            },
            artifact: {
              id: "prompt_req_123",
              workspaceId: "workspace_123",
              moduleId: "prompt-requirements",
              type: "prompt-requirements",
              status: "proposed",
              isCurrent: false,
              data: {
                creativeFactors: {
                  productCategory: "food-beverage",
                  dealType: "search-standard",
                  audience: "youth",
                  strategy: "scenario-demo"
                }
              },
              sourceFingerprint: {},
              promptAssembly: {},
              createdAt: "2026-06-06T00:00:00.000Z",
              updatedAt: "2026-06-06T00:00:00.000Z",
              approvedAt: null
            }
          }
        }),
        { status: 200 }
      );
    };

    const imported = await importReferenceVideoRequirements({
      workspaceId: "workspace_123",
      source: {
        type: "file",
        file: new File(["fake mp4 bytes"], "reference.mp4", {
          type: "video/mp4"
        })
      }
    });

    assert.equal(imported.artifact.status, "proposed");
    assert.equal("draft" in imported, false);
    assert.deepEqual(calls, [
      {
        method: "POST",
        url: "http://localhost:3000/api/workspaces/workspace_123/reference-video/import",
        bodyIsFormData: true,
        headers: null
      }
    ]);
  });

  it("imports reference requirements from multiple image and text files", async () => {
    let capturedBody: FormData | null = null;
    globalThis.fetch = async (_url, init) => {
      capturedBody = init?.body instanceof FormData ? init.body : null;
      return new Response(
        JSON.stringify({
          data: {
            source: {
              type: "files",
              count: 2,
              filenames: ["product.png", "卖点.md"],
              totalBytes: 42
            },
            analysis: { summary: "综合素材推断。", confidence: "medium" },
            creativeFactorsRecommendation: {
              recommendedFactors: {
                productCategory: "consumer-electronics",
                dealType: "search-standard",
                audience: "general",
                strategy: "review-comparison"
              },
              confidence: "medium"
            },
            artifact: {
              id: "prompt_req_files",
              workspaceId: "workspace_123",
              moduleId: "prompt-requirements",
              type: "prompt-requirements",
              status: "proposed",
              isCurrent: false,
              data: {},
              sourceFingerprint: {},
              promptAssembly: {},
              createdAt: "2026-06-06T00:00:00.000Z",
              updatedAt: "2026-06-06T00:00:00.000Z",
              approvedAt: null
            }
          }
        }),
        { status: 200 }
      );
    };

    const imported = await importReferenceVideoRequirements({
      workspaceId: "workspace_123",
      source: {
        type: "files",
        files: [
          new File(["img"], "product.png", { type: "image/png" }),
          new File(["核心卖点"], "卖点.md", { type: "text/markdown" })
        ]
      }
    });

    assert.equal(imported.source.type, "files");
    assert.ok(capturedBody, "expected multipart FormData body");
    const sent = (capturedBody as FormData).getAll("file");
    assert.equal(sent.length, 2);
    assert.equal((sent[0] as File).name, "product.png");
    assert.equal((sent[1] as File).name, "卖点.md");
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
          ],
          discovered: [
            {
              localPath: "/Users/demo/Drafts/IntegrationTest_current",
              workspaceId: "VBuy2YQUO9cwRY42fdcy8"
            }
          ]
        }),
        { status: 200 }
      );
    };

    const created = await createWorkspace("Desk Demo");
    const listed = await listWorkspaces();

    assert.equal(created.workspace.id, "workspace_123");
    assert.equal(listed.workspaces[0]?.id, "workspace_123");
    assert.equal(
      listed.discovered[0]?.localPath,
      "/Users/demo/Drafts/IntegrationTest_current"
    );
    assert.equal(listed.discovered[0]?.workspaceId, "VBuy2YQUO9cwRY42fdcy8");
    assert.deepEqual(calls, [
      "POST http://localhost:3000/api/workspaces",
      "GET http://localhost:3000/api/workspaces"
    ]);
  });

  it("opens the Fastify workspace directory picker", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "http://localhost:3000/api/workspaces/directory/select");
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

  it("detects image files that exceed the 10MB model input limit", () => {
    const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png"
    });
    const largeText = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.txt", {
      type: "text/plain"
    });

    assert.match(workspaceMaterialFileRejectionReason(tooLarge) ?? "", /图片超过 10MB/);
    assert.equal(workspaceMaterialFileRejectionReason(largeText), null);
  });

  it("deletes workspace materials by ref", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/materials/product%201.png"
      );
      assert.equal(init?.method, "DELETE");
      return new Response(
        JSON.stringify({
          data: {
            workspaceId: "workspace_123",
            ref: "product 1.png",
            deleted: true
          }
        }),
        { status: 200 }
      );
    };

    const deleted = await deleteWorkspaceMaterial({
      workspaceId: "workspace_123",
      ref: "product 1.png"
    });

    assert.equal(deleted.data.deleted, true);
  });

  it("deletes registered workspaces by id", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "http://localhost:3000/api/workspaces/workspace_123");
      assert.equal(init?.method, "DELETE");
      return new Response(
        JSON.stringify({
          data: {
            workspaceId: "workspace_123",
            deleted: true
          }
        }),
        { status: 200 }
      );
    };

    const deleted = await deleteWorkspace("workspace_123");

    assert.equal(deleted.data.workspaceId, "workspace_123");
    assert.equal(deleted.data.deleted, true);
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

  it("approves workspace brief artifacts through the current module API", async () => {
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
