import { expect, test, type Page, type Route } from "@playwright/test";

const workspaceId = "ws-apply-panel";
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

async function mockApplyPanelApi(page: Page) {
  const activeShots = [
    {
      id: "shot-active-1",
      workspaceId,
      shotSetId: "ss-active",
      orderIndex: 0,
      title: "开场钩子",
      objective: "先给出商品场景",
      defaultDurationSec: 4,
      status: "DRAFT",
      nextAction: "GENERATE_IMAGE_PROMPT",
      activeImagePromptArtifactId: null,
      selectedImageId: null,
      activeVideoScriptArtifactId: null,
      selectedVideoId: null,
      requirements: {
        shotImage: {},
        shotVideo: {},
        sourceShotPromptArtifactId: "shotprompt-old",
      },
    },
    {
      id: "shot-active-2",
      workspaceId,
      shotSetId: "ss-active",
      orderIndex: 1,
      title: "效果对比",
      objective: "展示使用后变化",
      defaultDurationSec: 5,
      status: "DRAFT",
      nextAction: "GENERATE_IMAGE_PROMPT",
      activeImagePromptArtifactId: null,
      selectedImageId: null,
      activeVideoScriptArtifactId: null,
      selectedVideoId: null,
      requirements: {
        shotImage: {},
        shotVideo: {},
        sourceShotPromptArtifactId: "shotprompt-old",
      },
    },
  ];

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/status`) {
      return json(route, {
        workspace: {
          id: workspaceId,
          localPath: "/tmp/daireel/apply-panel",
          currentScriptId: "script-apply-panel",
          status: "shotprompt_approved",
          traceFile: ".daireel/trace/events.jsonl",
          createdAt: now,
          updatedAt: now,
          lastSeenAt: now,
        },
        materialLibrary: {
          scannedAt: now,
          assets: [],
          rejected: [],
        },
        nextAction: {
          stage: "apply",
          endpoint: `/api/workspaces/${workspaceId}/shot-sets`,
          method: "POST",
          actionType: "shot_set_apply",
          requiresHumanApproval: true,
          willCallProvider: false,
          requiresProviderConfig: false,
        },
        activeShotSet: {
          id: "ss-active",
          workspaceId,
          shotPromptArtifactId: "shotprompt-old",
          status: "active",
          sourceFingerprint: {
            shotPromptArtifactId: "shotprompt-old",
          },
          upstream: {
            upstreamChanged: true,
            changedSources: ["shotPromptArtifactId"],
          },
          createdAt: now,
          archivedAt: null,
        },
        artifacts: {
          promptRequirements: artifact("prompt-requirements", {}),
          material: artifact("material-intake", {
            scannedAt: now,
            assets: [],
            rejected: [],
          }),
          brief: artifact("product-brief", {
            product: { name: "产品", category: "家居", keyFacts: [], assets: [] },
            audience: { who: "家庭用户", painOrDesire: "省心" },
            coreSellingPoint: "好用",
            proof: [],
            offer: null,
            platform: "douyin",
            brandTone: "直接",
            bannedExpressions: [],
            landingInfo: null,
            assumptions: [],
          }),
          storyboard: artifact("storyboard", {
            narrative: "展示产品",
            totalDurationSec: 9,
            shots: [],
            assumptions: [],
          }),
          shotPrompt: artifact("shotprompt", {
            targetProvider: "seedance",
            durationSec: 9,
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
      return json(route, { data: activeShots });
    }

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shot-workflow-status`
    ) {
      return json(route, {
        data: {
          workspaceId,
          shots: activeShots.map((shot) => ({
            shotId: shot.id,
            orderIndex: shot.orderIndex,
            status: shot.status,
            nextAction: shot.nextAction,
            activeImagePromptArtifactId: null,
            selectedImageId: null,
            activeVideoScriptArtifactId: null,
            selectedVideoId: null,
          })),
          canComposeFinalVideo: false,
        },
      });
    }

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/shot-sets`) {
      return json(route, {
        data: [
          {
            id: "ss-active",
            workspaceId,
            shotPromptArtifactId: "shotprompt-old",
            status: "active",
            sourceFingerprint: { shotPromptArtifactId: "shotprompt-old" },
            upstream: {
              upstreamChanged: true,
              changedSources: ["shotPromptArtifactId"],
            },
            shotCount: 2,
            createdAt: now,
            archivedAt: null,
          },
        ],
      });
    }

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/traces`) {
      return json(route, { data: [] });
    }

    if (path.includes("/image-rounds") || path.includes("/video-rounds")) {
      return json(route, { data: [] });
    }

    return json(route, {});
  };

  await page.route("http://localhost:3000/api/**", handleApiRoute);
  await page.route("http://127.0.0.1:3000/api/**", handleApiRoute);
}

test("apply shot set panel shows active instance and does not expose archived shots", async ({
  page,
}) => {
  await mockApplyPanelApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("button", { name: /应用分镜/ }).click();

  await expect(page.getByRole("heading", { name: "应用分镜" })).toBeVisible();
  await expect(page.getByText("当前分镜链路实例")).toBeVisible();
  await expect(page.getByText("开场钩子")).toBeVisible();
  await expect(page.getByText("效果对比")).toBeVisible();
  await expect(page.getByText("生效分镜生成要求有更新", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /应用并创建新实例/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /查看归档实例/ })).toHaveCount(0);
  await expect(page.getByText("旧开场")).toHaveCount(0);
});
