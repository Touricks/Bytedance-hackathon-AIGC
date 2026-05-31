import { expect, test, type Page, type Route } from "@playwright/test";

const workspaceId = "ws-e2e";
const shotId = "shot-1";

const now = new Date(0).toISOString();
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockWorkbenchApi(page: Page) {
  let imageProposed = false;
  let imageSelected = false;
  let videoProposed = false;
  const requests: {
    imagePropose?: unknown;
    imageSelect?: unknown;
    videoPropose?: unknown;
  } = {};

  const workspace = {
    id: workspaceId,
    localPath: "/tmp/daireel-e2e",
    currentScriptId: "script-e2e",
    status: "shotprompt_approved",
    traceFile: ".daireel/trace/events.jsonl",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };

  const statusBody = () => ({
    workspace,
    manifest: {
      schemaVersion: 1,
      workspaceId,
      currentScriptId: "script-e2e",
      traceFile: ".daireel/trace/events.jsonl",
    },
    nextAction: {
      stage: "shotprompt",
      endpoint: "/api/workspaces/artifacts/shotprompt/approve",
      method: "POST",
      actionType: "human_approval",
      requiresHumanApproval: false,
      willCallProvider: false,
      requiresProviderConfig: false,
    },
    materialLibrary: {
      scannedAt: now,
      primaryProductRef: `/api/workspaces/${workspaceId}/materials/product.png`,
      assets: [
        {
          ref: `/api/workspaces/${workspaceId}/materials/product.png`,
          kind: "image",
          mime: "image/png",
          bytes: 100,
          sha256: "a".repeat(64),
          role: "product_main",
          description: "hero product frame",
          relevance: "high",
          usable: true,
          included: true,
        },
      ],
      rejected: [],
    },
    artifacts: {
      material: {
        id: "mat-1",
        workspaceId,
        scriptId: "script-e2e",
        type: "assets",
        status: "approved",
        data: { scannedAt: now, primaryProductRef: "product.png", assets: [], rejected: [] },
        createdAt: now,
        updatedAt: now,
      },
      brief: {
        id: "brief-1",
        workspaceId,
        scriptId: "script-e2e",
        type: "brief",
        status: "approved",
        data: {
          product: { name: "Desk Lamp", category: "lighting", keyFacts: [], assets: [] },
          audience: { who: "home workers", painOrDesire: "clean desk light" },
          coreSellingPoint: "soft adjustable light",
          proof: [],
          offer: null,
          platform: "douyin",
          brandTone: "clear",
          bannedExpressions: [],
          landingInfo: null,
          assumptions: [],
        },
        createdAt: now,
        updatedAt: now,
      },
      storyboard: {
        id: "story-1",
        workspaceId,
        scriptId: "script-e2e",
        type: "storyboard",
        status: "approved",
        data: { narrative: "show product", totalDurationSec: 8, shots: [], assumptions: [] },
        createdAt: now,
        updatedAt: now,
      },
      shotPrompt: {
        id: "sp-1",
        workspaceId,
        scriptId: "script-e2e",
        type: "shotprompt",
        status: "approved",
        data: {
          targetProvider: "seedance",
          durationSec: 8,
          aspectRatio: "9:16",
          prompt: "two shot sequence",
          negativePrompt: "",
          shots: [],
          tts: { enabled: false, source: "shots.voiceover", voiceover: "" },
          assumptions: [],
        },
        createdAt: now,
        updatedAt: now,
      },
    },
  });

  const workflowStatus = () => ({
    data: {
      workspaceId,
      shots: [
        {
          shotId,
          orderIndex: 0,
          status: videoProposed
            ? "VIDEO_CANDIDATES_READY"
            : imageSelected
              ? "IMAGE_SELECTED"
              : imageProposed
                ? "IMAGE_CANDIDATES_READY"
                : "DRAFT",
          nextAction: videoProposed
            ? "SELECT_VIDEO"
            : imageSelected
              ? "GENERATE_VIDEO_SCRIPT"
              : imageProposed
                ? "SELECT_IMAGE"
                : "GENERATE_IMAGE_PROMPT",
          activeImagePromptArtifactId: imageProposed ? "imgp-1" : null,
          selectedImageId: imageSelected ? "imc-1" : null,
          activeVideoScriptArtifactId: videoProposed ? "vsa-1" : null,
          selectedVideoId: null,
          activeImageBatchId: imageProposed ? "imb-1" : null,
          activeVideoBatchId: videoProposed ? "vbb-1" : null,
        },
        {
          shotId: "shot-2",
          orderIndex: 1,
          status: "IMAGE_SELECTED",
          nextAction: "GENERATE_VIDEO_SCRIPT",
          activeImagePromptArtifactId: "imgp-2",
          selectedImageId: "imc-2",
          activeVideoScriptArtifactId: null,
          selectedVideoId: null,
          activeImageBatchId: "imb-2",
          activeVideoBatchId: null,
        },
      ],
      canComposeFinalVideo: false,
    },
  });

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith(".png")) {
      return route.fulfill({ contentType: "image/png", body: png });
    }

    if (request.method() === "GET" && path === "/api/workspaces") {
      return json(route, { workspaceRoot: "storage/workspaces", workspaces: [] });
    }

    if (request.method() === "POST" && path === "/api/workspaces/init") {
      return json(route, {
        workspace,
        manifest: {
          schemaVersion: 1,
          workspaceId,
          currentScriptId: "script-e2e",
          traceFile: ".daireel/trace/events.jsonl",
        },
      });
    }

    if (request.method() === "GET" && path === "/api/config/limits") {
      return json(route, {
        data: {
          defaultImageBatchSize: 3,
          maxImageBatchSize: 6,
          defaultVideoBatchSize: 1,
          maxVideoBatchSize: 10,
          aspectRatios: ["9:16", "16:9", "1:1"],
        },
      });
    }

    if (request.method() === "POST" && path === "/api/workspaces/status") {
      return json(route, statusBody());
    }

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shot-workflow-status`
    ) {
      return json(route, workflowStatus());
    }

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/shots`) {
      return json(route, {
        data: [
          {
            id: shotId,
            workspaceId,
            orderIndex: 0,
            title: "Hook",
            objective: "open strong",
            defaultDurationSec: 4,
            status: "DRAFT",
            nextAction: "GENERATE_IMAGE_PROMPT",
            activeImagePromptArtifactId: imageProposed ? "imgp-1" : null,
            selectedImageId: imageSelected ? "imc-1" : null,
            activeVideoScriptArtifactId: videoProposed ? "vsa-1" : null,
            selectedVideoId: null,
          },
        ],
      });
    }

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/image-rounds`
    ) {
      return json(route, {
        data: imageProposed
          ? [
              {
                artifact: {
                  id: "imgp-1",
                  shotId,
                  version: 1,
                  status: "ACTIVE",
                  promptText: "clean product hero image",
                  negativePrompt: "",
                  referenceAssetIds: [],
                  createdBy: "agent",
                  createdAt: now,
                },
                batch: {
                  id: "imb-1",
                  workspaceId,
                  shotId,
                  status: "SUCCEEDED",
                  requestedCount: 3,
                  succeededCount: 3,
                  failedCount: 0,
                  provider: "ark-seedream",
                  aspectRatio: "9:16",
                  providerRequest: {},
                  errorMessage: null,
                  idempotencyKey: "internal",
                  createdAt: now,
                  updatedAt: now,
                },
                candidates: [
                  {
                    id: "imc-1",
                    imageUrl: `/api/workspaces/${workspaceId}/materials/generated-images/imc-1.png`,
                    status: "SUCCEEDED",
                  },
                ],
                selection: null,
                context: {},
              },
            ]
          : [],
      });
    }

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/video-rounds`
    ) {
      return json(route, {
        data: videoProposed
          ? [
              {
                artifact: {
                  id: "vsa-1",
                  shotId,
                  version: 1,
                  status: "ACTIVE",
                  durationSec: 4,
                  scriptJson: {},
                  providerPrompt: "Seedance four second product motion",
                  basedOnImageCandidateId: "imc-1",
                  basedOnPrevImageCandidateId: null,
                  basedOnNextImageCandidateId: null,
                  createdBy: "agent",
                  createdAt: now,
                },
                batch: {
                  id: "vbb-1",
                  workspaceId,
                  shotId,
                  status: "SUCCEEDED",
                  requestedCount: 1,
                  succeededCount: 1,
                  failedCount: 0,
                  provider: "seedance",
                  aspectRatio: "9:16",
                  providerRequest: {},
                  errorMessage: null,
                  idempotencyKey: null,
                  createdAt: now,
                  updatedAt: now,
                },
                candidates: [],
                selection: null,
                frames: {
                  firstFrameUrl: `/api/workspaces/${workspaceId}/materials/generated-images/imc-1.png`,
                  lastFrameUrl: null,
                  firstFrameCandidateId: "imc-1",
                  lastFrameCandidateId: null,
                },
                context: {},
              },
            ]
          : [],
      });
    }

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/traces`) {
      return json(route, {
        data: [
          {
            id: "tr-1",
            workspaceId,
            shotId,
            traceType: "agent_run",
            name: "image_prompt_proposed",
            inputPreview: null,
            outputPreview: "ok",
            metadata: {},
            createdAt: now,
          },
        ],
      });
    }

    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`
    ) {
      imageProposed = true;
      requests.imagePropose = request.postDataJSON();
      return json(route, {
        data: { id: "imgp-1" },
        artifact: { id: "imgp-1" },
        batch: { id: "imb-1", status: "PENDING" },
        candidates: [{ id: "imc-1", status: "PENDING" }],
        shotStatus: "IMAGE_GENERATING",
        traceId: "trace-image",
      });
    }

    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/image-candidates/select`
    ) {
      imageSelected = true;
      requests.imageSelect = request.postDataJSON();
      return json(route, {
        data: { selectedImageId: "imc-1" },
        shotStatus: "IMAGE_SELECTED",
      });
    }

    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/video-scripts/propose`
    ) {
      videoProposed = true;
      requests.videoPropose = request.postDataJSON();
      return json(route, {
        data: { id: "vsa-1" },
        artifact: { id: "vsa-1" },
        batch: { id: "vbb-1", status: "SUCCEEDED" },
        candidates: [],
        shotStatus: "VIDEO_CANDIDATES_READY",
        traceId: "trace-video",
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
  await mockWorkbenchApi(page);
  await page.goto("/");

  await page.getByLabel("工作目录路径").fill("/tmp/daireel-e2e");
  await page.getByRole("button", { name: "打开" }).click();

  await expect(page).toHaveURL(/\/workspaces\/ws-e2e/);
  await expect(page.getByRole("heading", { name: "Artifact Pipeline" })).toBeVisible();
});

test("workbench drives propose/select endpoints from the current interface", async ({
  page,
}) => {
  const requests = await mockWorkbenchApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "Shot Workbench" })).toBeVisible();

  await page.getByRole("button", { name: /Image propose/ }).click();
  await expect(page.getByText("SUCCEEDED")).toBeVisible();
  expect(requests.imagePropose).toEqual({});

  await page.locator(".workbench-candidate").first().click();
  expect(requests.imageSelect).toEqual({
    imageCandidateId: "imc-1",
    imageGenerationBatchId: "imb-1",
  });

  await expect(page.getByRole("button", { name: /Video propose/ })).toBeEnabled();
  await page.getByRole("button", { name: /Video propose/ }).click();
  expect(requests.videoPropose).toEqual({});
  await expect(page.getByText("SUCCEEDED")).toBeVisible();
});
