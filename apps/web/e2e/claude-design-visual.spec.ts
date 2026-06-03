import { expect, test, type Page, type Route } from "@playwright/test";

const workspaceId = "ws-visual";
const shotId = "shot-visual-1";
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

function artifact(moduleId: string, data: unknown) {
  return {
    id: `${moduleId}-visual`,
    workspaceId,
    moduleId,
    type: moduleId,
    status: "approved",
    isCurrent: true,
    data,
    sourceFingerprint: {},
    promptAssembly: {},
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
  };
}

function imageRound({
  artifactId,
  batchId,
  candidateId,
  imageUrl,
  version,
}: {
  artifactId: string;
  batchId: string;
  candidateId: string;
  imageUrl: string;
  version: number;
}) {
  return {
    artifact: {
      id: artifactId,
      shotId,
      version,
      status: "ACTIVE",
      promptText: "clean product hero image",
      negativePrompt: null,
      referenceAssetIds: ["product.png"],
      promptJson: null,
      createdBy: "system",
      createdAt: now,
    },
    batch: {
      id: batchId,
      workspaceId,
      shotId,
      imagePromptArtifactId: artifactId,
      provider: "deterministic",
      status: "SUCCEEDED",
      requestedCount: 1,
      succeededCount: 1,
      failedCount: 0,
      aspectRatio: "9:16",
      providerRequest: {},
      errorMessage: null,
      idempotencyKey: null,
      createdAt: now,
      updatedAt: now,
    },
    candidates: [
      {
        id: candidateId,
        imageUrl,
        status: "SUCCEEDED",
        errorMessage: null,
      },
    ],
    selection: null,
    context: {},
  };
}

async function mockVisualApi(page: Page) {
  let includesInsertedCandidate = false;
  const workspace = {
    id: workspaceId,
    localPath: "/tmp/daireel-visual/latest-campaign",
    currentScriptId: "script-visual",
    status: "shotprompt_approved",
    traceFile: ".daireel/trace/events.jsonl",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith(".png")) {
      return route.fulfill({ contentType: "image/png", body: png });
    }

    if (request.method() === "GET" && path === "/api/workspaces") {
      return json(route, {
        workspaceRoot: "storage/workspaces",
        workspaces: [workspace],
        discovered: [
          {
            localPath: "/tmp/daireel-visual/unregistered",
            workspaceId: "ws-old",
          },
        ],
      });
    }

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/status`) {
      return json(route, {
        workspace,
        manifest: {
          schemaVersion: 1,
          workspaceId,
          currentScriptId: "script-visual",
          traceFile: ".daireel/trace/events.jsonl",
        },
        nextAction: {
          stage: "image",
          endpoint: `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`,
          method: "POST",
          actionType: "human_approval",
          requiresHumanApproval: true,
          willCallProvider: false,
          requiresProviderConfig: false,
        },
        materialLibrary: {
          scannedAt: now,
          primaryProductRef: "product.png",
          assets: [
            {
              ref: "product.png",
              kind: "image",
              mime: "image/png",
              bytes: 128,
              sha256: "a".repeat(64),
              role: "product_main",
              description: "商品主图",
              relevance: "high",
              usable: true,
              included: true,
            },
          ],
          rejected: [],
        },
        activeShotSet: {
          id: "shotset-visual",
          workspaceId,
          shotPromptArtifactId: "shotprompt-visual",
          status: "active",
          sourceFingerprint: {},
          createdAt: now,
          archivedAt: null,
        },
        artifacts: {
          promptRequirements: artifact("prompt-requirements", {
            image: { style: "clean ecommerce" },
          }),
          material: artifact("material-intake", {
            scannedAt: now,
            primaryProductRef: "product.png",
            assets: [],
            rejected: [],
          }),
          brief: artifact("product-brief", {
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
          }),
          storyboard: artifact("storyboard", {
            narrative: "show product",
            totalDurationSec: 8,
            shots: [],
            assumptions: [],
          }),
          shotPrompt: artifact("shotprompt", {
            targetProvider: "seedance",
            durationSec: 8,
            aspectRatio: "9:16",
            prompt: "two shot sequence",
            negativePrompt: "",
            shots: [],
            tts: { enabled: false, source: "shots.voiceover", voiceover: "" },
            assumptions: [],
          }),
        },
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
              status: "IMAGE_CANDIDATES_READY",
              nextAction: "SELECT_IMAGE",
              activeImagePromptArtifactId: "image-prompt-visual",
              selectedImageId: null,
              activeVideoScriptArtifactId: null,
              selectedVideoId: null,
              activeImageBatchId: "image-batch-visual",
              activeVideoBatchId: null,
            },
          ],
          canComposeFinalVideo: false,
        },
      });
    }

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/shots`) {
      return json(route, {
        data: [
          {
            id: shotId,
            workspaceId,
            orderIndex: 0,
            title: "商品亮相",
            objective: "呈现商品完整外观",
            defaultDurationSec: 4,
            status: "IMAGE_CANDIDATES_READY",
            nextAction: "SELECT_IMAGE",
            activeImagePromptArtifactId: "image-prompt-visual",
            selectedImageId: null,
            activeVideoScriptArtifactId: null,
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
        data: [
          ...(includesInsertedCandidate
            ? [
                imageRound({
                  artifactId: "image-prompt-visual-v2",
                  batchId: "image-batch-visual-v2",
                  candidateId: "image-candidate-visual-inserted",
                  imageUrl: "/visual-candidate-inserted.png",
                  version: 2,
                }),
              ]
            : []),
          imageRound({
            artifactId: "image-prompt-visual",
            batchId: "image-batch-visual",
            candidateId: "image-candidate-visual-original",
            imageUrl: "/visual-candidate-original.png",
            version: 1,
          }),
        ],
      });
    }

    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`
    ) {
      includesInsertedCandidate = true;
      const insertedRound = imageRound({
        artifactId: "image-prompt-visual-v2",
        batchId: "image-batch-visual-v2",
        candidateId: "image-candidate-visual-inserted",
        imageUrl: "/visual-candidate-inserted.png",
        version: 2,
      });
      return json(route, {
        artifact: insertedRound.artifact,
        batch: insertedRound.batch,
        candidates: insertedRound.candidates,
        data: insertedRound.artifact,
      });
    }

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/video-rounds`
    ) {
      return json(route, { data: [] });
    }

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/traces`) {
      return json(route, { data: [] });
    }

    return route.continue();
  });
}

test("latest frontend uses Claude Design tokens and restored shell colors", async ({
  page,
}) => {
  await mockVisualApi(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "创作工作区" })).toBeVisible();
  await expect(page.locator(".ws-card")).toBeVisible();

  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      accent: style.getPropertyValue("--accent").trim(),
      bg: style.getPropertyValue("--bg").trim(),
      canvas: style.getPropertyValue("--canvas").trim(),
      legacyAccent: style.getPropertyValue("--latest-accent").trim(),
    };
  });
  expect(tokens).toEqual({
    accent: "#4B47E6",
    bg: "#F6F7F9",
    canvas: "#121319",
    legacyAccent: "",
  });

  await expect
    .poll(() =>
      page
        .locator(".workspaces-landing")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe("rgb(246, 247, 249)");

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "分镜图选择" })).toBeVisible();
  await expect(page.getByText("创作审核台")).toBeVisible();

  const railBox = await page.locator(".review-rail").boundingBox();
  expect(railBox?.width).toBeGreaterThan(230);
  expect(railBox?.width).toBeLessThan(260);

  const shellColors = await page.evaluate(() => {
    const rail = document.querySelector(".review-rail");
    const panel = document.querySelector(".review-panel");
    const activeStep = document.querySelector(".review-step--active");
    if (!rail || !panel || !activeStep) throw new Error("missing review shell");
    return {
      rail: getComputedStyle(rail).backgroundColor,
      panel: getComputedStyle(panel).backgroundColor,
      activeStep: getComputedStyle(activeStep).backgroundColor,
    };
  });
  expect(shellColors).toEqual({
    rail: "rgb(240, 242, 245)",
    panel: "rgb(255, 255, 255)",
    activeStep: "rgb(255, 255, 255)",
  });

  await expect(page.locator(".review-image-prompt-form")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "编辑本镜要求" })).toBeVisible();
  await expect(page.getByAltText("image-candidate-visual-original")).toBeVisible();

  await page.getByRole("button", { name: "生成分镜图候选" }).click();
  await expect(page.getByAltText("image-candidate-visual-inserted")).toBeVisible();
  await expect(page.getByAltText("image-candidate-visual-original")).toBeVisible();
});
