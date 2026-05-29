import { expect, test, type Page, type Route } from "@playwright/test";

const workspaceId = "ws-e2e";
const shotId = "shot-1";

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

async function mockWorkspaceApi(page: Page) {
  let imageBatchStarted = false;
  let videoBatchStarted = false;
  const requests: {
    imageBatch?: unknown;
    videoBatch?: unknown;
  } = {};

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "GET" && path === "/api/workspaces") {
      return json(route, { workspaceRoot: "storage/workspaces", workspaces: [] });
    }

    if (request.method() === "POST" && path === "/api/workspaces/init") {
      const body = request.postDataJSON() as { directory?: string };
      return json(route, {
        workspace: {
          id: workspaceId,
          localPath: body.directory,
          currentScriptId: "script-e2e",
          status: "draft",
          traceFile: ".daireel/trace/events.jsonl",
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          lastSeenAt: new Date(0).toISOString()
        },
        manifest: {
          schemaVersion: 1,
          workspaceId,
          currentScriptId: "script-e2e",
          traceFile: ".daireel/trace/events.jsonl"
        }
      });
    }

    if (request.method() === "POST" && path === "/api/workspaces/status") {
      return json(route, {
        workspace: { id: workspaceId, localPath: "/tmp/e2e", status: "draft" },
        manifest: {
          schemaVersion: 1,
          workspaceId,
          currentScriptId: "script-e2e",
          traceFile: ".daireel/trace/events.jsonl"
        },
        nextAction: {},
        materialLibrary: {
          scannedAt: new Date(0).toISOString(),
          assets: [],
          rejected: []
        }
      });
    }

    if (request.method() === "GET" && path === "/api/config/limits") {
      return json(route, {
        data: {
          defaultImageBatchSize: 3,
          maxImageBatchSize: 6,
          defaultVideoBatchSize: 5,
          maxVideoBatchSize: 10,
          aspectRatios: ["9:16", "16:9", "1:1"]
        }
      });
    }

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shot-workflow-status`
    ) {
      return json(route, {
        data: {
          workspaceId,
          shots: [
            {
              shotId,
              orderIndex: 0,
              status: videoBatchStarted
                ? "VIDEO_GENERATING"
                : imageBatchStarted
                  ? "IMAGE_GENERATING"
                  : "IMAGE_PROMPT_READY",
              nextAction: videoBatchStarted
                ? "POLL_VIDEO_BATCH"
                : imageBatchStarted
                  ? "POLL_IMAGE_BATCH"
                  : "GENERATE_IMAGES",
              activeImagePromptArtifactId: "imgp-1",
              selectedImageId: imageBatchStarted ? "imc-1" : null,
              activeVideoScriptArtifactId: "vsa-1",
              selectedVideoId: null,
              activeImageBatchId: imageBatchStarted ? "imb-1" : null,
              activeVideoBatchId: videoBatchStarted ? "vbb-1" : null
            }
          ],
          canComposeFinalVideo: false
        }
      });
    }

    if (request.method() === "GET" && path === `/api/shots/${shotId}/asset-refs`) {
      return json(route, { data: [] });
    }

    if (request.method() === "GET" && path === `/api/shots/${shotId}/image-prompts`) {
      return json(route, {
        data: [
          {
            id: "imgp-1",
            shotId,
            version: 1,
            status: "ACTIVE",
            promptText: "中文分镜图 prompt，展示商品在办公桌上的清晰首帧。",
            negativePrompt: "",
            referenceAssetIds: [],
            createdBy: "agent",
            createdAt: new Date(0).toISOString()
          }
        ]
      });
    }

    if (request.method() === "POST" && path === `/api/shots/${shotId}/image-batches`) {
      imageBatchStarted = true;
      requests.imageBatch = request.postDataJSON();
      return json(route, {
        data: {
          batchId: "imb-1",
          jobId: "job-image",
          status: "PENDING",
          requestedCount: 3
        }
      });
    }

    if (
      request.method() === "GET" &&
      path === `/api/shots/${shotId}/image-batches/imb-1`
    ) {
      return json(route, {
        data: {
          id: "imb-1",
          batchId: "imb-1",
          status: "SUCCEEDED",
          requestedCount: 3,
          succeededCount: 3,
          failedCount: 0,
          candidates: [
            { id: "imc-1", imageUrl: "https://cdn.example/1.png", status: "SUCCEEDED" },
            { id: "imc-2", imageUrl: "https://cdn.example/2.png", status: "SUCCEEDED" },
            { id: "imc-3", imageUrl: "https://cdn.example/3.png", status: "SUCCEEDED" }
          ]
        }
      });
    }

    if (request.method() === "GET" && path === `/api/shots/${shotId}/video-scripts`) {
      return json(route, {
        data: [
          {
            id: "vsa-1",
            shotId,
            version: 1,
            status: "ACTIVE",
            durationSec: 4,
            scriptJson: {
              cameraMotion: "slow push in",
              subjectMotion: "product remains stable",
              voiceover: "清晰展示商品卖点。"
            },
            providerPrompt:
              "中文 Seedance 分镜视频剧本，持续四秒，保持商品外观稳定并完成一次连续镜头运动。",
            basedOnImageCandidateId: "imc-1",
            basedOnPrevImageCandidateId: null,
            basedOnNextImageCandidateId: null,
            createdBy: "agent",
            createdAt: new Date(0).toISOString()
          }
        ]
      });
    }

    if (request.method() === "POST" && path === `/api/shots/${shotId}/video-batches`) {
      videoBatchStarted = true;
      requests.videoBatch = request.postDataJSON();
      return json(route, {
        data: {
          batchId: "vbb-1",
          jobId: "job-video",
          status: "PENDING",
          requestedCount: 5
        }
      });
    }

    if (
      request.method() === "GET" &&
      path === `/api/shots/${shotId}/video-batches/vbb-1`
    ) {
      return json(route, {
        data: {
          id: "vbb-1",
          batchId: "vbb-1",
          status: "SUCCEEDED",
          requestedCount: 5,
          succeededCount: 5,
          failedCount: 0,
          candidates: []
        }
      });
    }

    return json(route, {});
  };

  await page.route("http://localhost:3000/api/**", handleApiRoute);
  await page.route("http://127.0.0.1:3000/api/**", handleApiRoute);
  await page.route("http://localhost:3100/api/**", handleApiRoute);
  await page.route("http://127.0.0.1:3100/api/**", handleApiRoute);

  return requests;
}

test("user can open a chosen working directory", async ({ page }) => {
  await mockWorkspaceApi(page);
  await page.goto("/");

  await page.getByLabel("工作目录路径").fill("/tmp/daireel-e2e");
  await page.getByRole("button", { name: "打开" }).click();

  await expect(page).toHaveURL(/\/workspaces\/ws-e2e/);
});

test("per-shot controls default to 3 images and 5 videos", async ({ page }) => {
  const requests = await mockWorkspaceApi(page);

  await page.goto(`/workspaces/${workspaceId}?shot=${shotId}&step=image_prompt`);
  await expect(page.getByRole("button", { name: "生成 3 张图" })).toBeVisible();
  await page.getByRole("button", { name: "生成 3 张图" }).click();
  await expect(page).toHaveURL(/step=image_candidates/);
  expect((requests.imageBatch as { count?: number }).count).toBe(3);
  await expect(page.getByText("状态 SUCCEEDED · 3/3")).toBeVisible();

  await page.goto(`/workspaces/${workspaceId}?shot=${shotId}&step=video_script`);
  await expect(page.getByRole("button", { name: "生成 5 个视频" })).toBeVisible();
  await page.getByRole("button", { name: "生成 5 个视频" }).click();
  await expect(page).toHaveURL(/step=video_candidates/);
  expect((requests.videoBatch as { count?: number }).count).toBe(5);
});
