import { expect, test, type Page, type Route } from "@playwright/test";

const workspaceId = "ws-image-feedback";
const shotId = "shot-feedback-1";
const now = "2026-06-02T08:40:00.000Z";

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function artifact(moduleId: string, data: unknown) {
  return {
    id: `${moduleId}-current`,
    workspaceId,
    moduleId,
    type: moduleId,
    status: "approved",
    isCurrent: true,
    data,
    sourceFingerprint: {},
    promptAssembly: {
      moduleId,
      subjectHash: "a".repeat(64),
      contractHash: "b".repeat(64),
    },
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
  };
}

async function mockImageFeedbackApi(page: Page) {
  let regenerateBody: unknown = null;
  const shot = {
    id: shotId,
    workspaceId,
    shotSetId: "ss-active",
    orderIndex: 0,
    title: "开场钩子",
    objective: "展示入口标识",
    defaultDurationSec: 4,
    status: "IMAGE_CANDIDATES_READY",
    nextAction: "SELECT_IMAGE",
    activeImagePromptArtifactId: "art_img_1",
    selectedImageId: null,
    activeVideoScriptArtifactId: null,
    selectedVideoId: null,
    requirements: {
      shotImage: {
        scene: "庄园入口外景，入口标识清晰可见",
        composition: "入口标识居中，主体突出",
        lighting: "自然光",
        negative: "文字模糊",
      },
      shotVideo: {
        cameraMotion: "缓慢推进",
        firstFrame: "入口标识完整出现",
        continuity: "暖调一致",
        negative: "快速抖动",
      },
      sourceShotPromptArtifactId: "shotprompt-current",
    },
  };

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/status`) {
      return json(route, {
        workspace: {
          id: workspaceId,
          localPath: "/tmp/daireel/image-feedback",
          currentScriptId: "script-image-feedback",
          status: "image_candidates_ready",
          traceFile: ".daireel/trace/events.jsonl",
          createdAt: now,
          updatedAt: now,
          lastSeenAt: now,
        },
        materialLibrary: { scannedAt: now, assets: [], rejected: [] },
        nextAction: {
          stage: "image",
          endpoint: `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/regenerate`,
          method: "POST",
          actionType: "image_prompt_regenerate",
          requiresHumanApproval: true,
          willCallProvider: true,
          requiresProviderConfig: false,
        },
        activeShotSet: {
          id: "ss-active",
          workspaceId,
          shotPromptArtifactId: "shotprompt-current",
          status: "active",
          sourceFingerprint: { shotPromptArtifactId: "shotprompt-current" },
          upstream: { upstreamChanged: false, changedSources: [] },
          createdAt: now,
          archivedAt: null,
        },
        artifacts: {
          promptRequirements: artifact("prompt-requirements", {}),
          material: artifact("material-intake", { scannedAt: now, assets: [], rejected: [] }),
          brief: artifact("product-brief", {
            product: { name: "测试商品", category: "场景", keyFacts: [], assets: [] },
            audience: { who: "访客", painOrDesire: "识别入口" },
            coreSellingPoint: "入口清晰",
            proof: [],
            offer: null,
            platform: "douyin",
            brandTone: "真实",
            bannedExpressions: [],
            landingInfo: null,
            assumptions: [],
          }),
          storyboard: artifact("storyboard", {
            narrative: "展示入口",
            totalDurationSec: 4,
            shots: [],
            assumptions: [],
          }),
          shotPrompt: artifact("shotprompt", {
            targetProvider: "seedance",
            durationSec: 4,
            aspectRatio: "9:16",
            prompt: "按分镜生成",
            negativePrompt: "",
            shots: [],
            tts: { enabled: false, source: "shots.voiceover", voiceover: "" },
            assumptions: [],
          }),
        },
      });
    }

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/shots`) {
      return json(route, { data: [shot] });
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
              activeImagePromptArtifactId: "art_img_1",
              selectedImageId: null,
              activeVideoScriptArtifactId: null,
              selectedVideoId: null,
              activeImageBatchId: "imb_1",
              activeVideoBatchId: null,
            },
          ],
          canComposeFinalVideo: false,
        },
      });
    }

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/image-rounds`
    ) {
      return json(route, {
        data: [
          {
            artifact: {
              id: "art_img_1",
              shotId,
              version: 1,
              status: "ACTIVE",
              promptText: "入口标识静态关键帧",
              negativePrompt: null,
              referenceAssetIds: [],
              promptJson: null,
              createdBy: "agent",
              createdAt: now,
            },
            batch: {
              id: "imb_1",
              workspaceId,
              shotId,
              imagePromptArtifactId: "art_img_1",
              status: "SUCCEEDED",
              requestedCount: 1,
              succeededCount: 1,
              failedCount: 0,
              provider: "ark-seedream",
              aspectRatio: "9:16",
              providerRequest: {},
              errorMessage: null,
              idempotencyKey: "image:art_img_1",
              createdAt: now,
              updatedAt: now,
            },
            candidates: [
              {
                id: "imc_1",
                imageUrl: "data:image/png;base64,iVBORw0KGgo=",
                status: "SUCCEEDED",
              },
            ],
            selection: null,
            upstream: { upstreamChanged: false, changedSources: [] },
            context: {},
          },
        ],
      });
    }

    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/regenerate`
    ) {
      regenerateBody = request.postDataJSON();
      return json(route, {
        data: {
          id: "art_img_2",
          shotId,
          version: 2,
          status: "ACTIVE",
          promptText: "反馈后的入口标识静态关键帧",
          negativePrompt: null,
          referenceAssetIds: [],
          createdBy: "user",
          baseArtifactId: "art_img_1",
          createdAt: now,
        },
        artifact: {
          id: "art_img_2",
          shotId,
          version: 2,
          status: "ACTIVE",
          promptText: "反馈后的入口标识静态关键帧",
          negativePrompt: null,
          referenceAssetIds: [],
          createdBy: "user",
          baseArtifactId: "art_img_1",
          createdAt: now,
        },
        batch: { id: "imb_2", status: "PENDING", requestedCount: 1, succeededCount: 0, failedCount: 0 },
        candidates: [],
        shotStatus: "IMAGE_GENERATING",
        nextAction: "POLL_IMAGE_BATCH",
        context: {},
      });
    }

    if (path.includes("/video-rounds")) return json(route, { data: [] });
    if (path.includes("/shot-sets")) return json(route, { data: [] });
    if (path.includes("/traces")) return json(route, { data: [] });
    return json(route, {});
  };

  await page.route("http://localhost:3000/api/**", handleApiRoute);
  await page.route("http://127.0.0.1:3000/api/**", handleApiRoute);
  return () => regenerateBody;
}

test("image prompt feedback uses upstream shot requirements and submits only feedback", async ({
  page,
}) => {
  const regenerateBody = await mockImageFeedbackApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("button", { name: /分镜图选择/ }).click();
  await page.getByRole("button", { name: "补充生成反馈" }).click();

  await expect(page.getByText("分镜图要求")).toBeVisible();
  await expect(page.getByText("庄园入口外景，入口标识清晰可见")).toBeVisible();
  await expect(page.getByText("分镜视频要求")).toBeVisible();
  await expect(page.getByText("缓慢推进")).toBeVisible();

  await page.getByLabel("本次反馈").fill("入口标识再清晰一些");
  await page.getByRole("button", { name: "重新生成候选图" }).click();

  await expect.poll(regenerateBody).toEqual({
    baseArtifactId: "art_img_1",
    userDirection: "入口标识再清晰一些",
  });
});
