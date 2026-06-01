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

  const artifact = (moduleId: string, data: unknown) => ({
    id: `${moduleId}-1`,
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
  });

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
      endpoint: `/api/workspaces/${workspaceId}/shotprompt/approve`,
      method: "POST",
      actionType: "human_approval",
      requiresHumanApproval: false,
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
    activeShotSet: {
      id: "shotset-1",
      workspaceId,
      shotPromptArtifactId: "sp-1",
      status: "active",
      sourceFingerprint: {},
      createdAt: now,
      archivedAt: null,
    },
    artifacts: {
      promptRequirements: artifact("prompt-requirements", {
        image: { style: "clean ecommerce" },
        script: { tone: "clear" },
        storyboard: { rhythm: "fast" },
        shotImage: { global: "preserve scene" },
        shotVideo: { global: "smooth motion" },
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

    if (request.method() === "POST" && path === "/api/workspaces") {
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

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/status`
    ) {
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

async function mockReviewStartApi(page: Page) {
  let materialUploaded = false;
  let requirementsApproved = false;
  let materialApproved = false;
  let briefProposed = false;
  const calls: string[] = [];

  const workspace = {
    id: workspaceId,
    localPath: "/tmp/daireel-e2e",
    currentScriptId: "script-e2e",
    status: "draft",
    traceFile: ".daireel/trace/events.jsonl",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };

  const artifact = (moduleId: string, data: unknown, status: "proposed" | "approved") => ({
    id: `${moduleId}-${status}`,
    workspaceId,
    moduleId,
    type: moduleId,
    status,
    isCurrent: status === "approved",
    data,
    sourceFingerprint: {},
    promptAssembly: {
      moduleId,
      subjectHash: "a".repeat(64),
      contractHash: "b".repeat(64),
    },
    createdAt: now,
    updatedAt: now,
    approvedAt: status === "approved" ? now : null,
  });

  const materialData = {
    scannedAt: now,
    primaryProductRef: "product.png",
    assets: [],
    rejected: [],
  };
  const briefData = {
    product: {
      name: "Desk Lamp",
      category: "lighting",
      keyFacts: ["soft light"],
      assets: [{ ref: "product.png", useAs: "primary" }],
    },
    audience: { who: "home workers", painOrDesire: "clean desk light" },
    coreSellingPoint: "soft adjustable light",
    proof: ["uploaded product image"],
    offer: null,
    platform: "douyin",
    brandTone: "clear",
    bannedExpressions: [],
    landingInfo: "old decorative product detail page",
    assumptions: ["old decorative wall art assumption"],
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
      stage: "requirements",
      endpoint: `/api/workspaces/${workspaceId}/prompt-requirements/propose`,
      method: "POST",
      actionType: "human_approval",
      requiresHumanApproval: true,
      willCallProvider: false,
      requiresProviderConfig: false,
    },
    materialLibrary: {
      scannedAt: now,
      primaryProductRef: materialUploaded ? "product.png" : undefined,
      assets: materialUploaded
        ? [
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
          ]
        : [],
      rejected: [],
    },
    artifacts: {
      promptRequirements: requirementsApproved
        ? artifact(
            "prompt-requirements",
            {
              image: { style: "clean" },
              shotImage: { global: "consistent scene" },
              shotVideo: { global: "smooth motion" },
            },
            "approved",
          )
        : null,
      material: materialApproved
        ? artifact("material-intake", materialData, "approved")
        : null,
      brief: briefProposed
        ? artifact("product-brief", briefData, "proposed")
        : null,
      storyboard: null,
      shotPrompt: null,
    },
    activeShotSet: null,
  });

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === "GET" && path === "/api/workspaces") {
      return json(route, { workspaceRoot: "storage/workspaces", workspaces: [] });
    }
    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/status`
    ) {
      return json(route, statusBody());
    }
    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shot-workflow-status`
    ) {
      return json(route, {
        data: { workspaceId, shots: [], canComposeFinalVideo: false },
      });
    }
    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/traces`) {
      return json(route, { data: [] });
    }
    if (request.method() === "POST" && path === `/api/workspaces/${workspaceId}/materials`) {
      materialUploaded = true;
      calls.push("upload-material");
      return json(route, {
        workspace,
        material: {
          ref: "product.png",
          bytes: 100,
          url: `/api/workspaces/${workspaceId}/materials/product.png`,
        },
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/prompt-requirements/propose`
    ) {
      calls.push("propose-requirements");
      return json(route, {
        data: artifact("prompt-requirements", request.postDataJSON().data, "proposed"),
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/prompt-requirements/approve`
    ) {
      requirementsApproved = true;
      calls.push("approve-requirements");
      return json(route, {
        data: artifact("prompt-requirements", { image: {}, shotImage: {}, shotVideo: {} }, "approved"),
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/material-intake/propose`
    ) {
      calls.push("propose-material");
      return json(route, {
        data: artifact("material-intake", materialData, "proposed"),
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/material-intake/approve`
    ) {
      materialApproved = true;
      calls.push("approve-material");
      return json(route, {
        data: artifact("material-intake", materialData, "approved"),
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/product-brief/propose`
    ) {
      briefProposed = true;
      calls.push("propose-brief");
      return json(route, {
        data: artifact("product-brief", briefData, "proposed"),
      });
    }

    return json(route, {});
  };

  await page.route("http://localhost:3000/api/**", handleApiRoute);
  await page.route("http://127.0.0.1:3000/api/**", handleApiRoute);
  await page.route("http://localhost:3100/api/**", handleApiRoute);
  await page.route("http://127.0.0.1:3100/api/**", handleApiRoute);

  return calls;
}

async function mockLayeredReviewApi(page: Page) {
  let briefApproved = false;
  let storyboardProposed = false;
  let storyboardApproved = false;
  let shotPromptProposed = false;
  let shotPromptApproved = false;
  let shotSetApplied = false;
  const state: {
    calls: string[];
    approveBriefBody?: unknown;
    approveStoryboardBody?: unknown;
    approveShotPromptBody?: unknown;
  } = { calls: [] };

  const workspace = {
    id: workspaceId,
    localPath: "/tmp/daireel-e2e",
    currentScriptId: "script-e2e",
    status: "brief_proposed",
    traceFile: ".daireel/trace/events.jsonl",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };

  const artifact = (moduleId: string, data: unknown, status: "proposed" | "approved") => ({
    id: `${moduleId}-${status}`,
    workspaceId,
    moduleId,
    type: moduleId,
    status,
    isCurrent: status === "approved",
    data,
    sourceFingerprint: {},
    promptAssembly: {
      moduleId,
      subjectHash: "a".repeat(64),
      contractHash: "b".repeat(64),
    },
    createdAt: now,
    updatedAt: now,
    approvedAt: status === "approved" ? now : null,
  });

  const briefData = {
    product: {
      name: "Desk Lamp",
      category: "lighting",
      keyFacts: ["soft light"],
      assets: [{ ref: "product.png", useAs: "primary" }],
    },
    audience: { who: "home workers", painOrDesire: "clean desk light" },
    coreSellingPoint: "soft adjustable light",
    proof: ["uploaded product image"],
    offer: null,
    platform: "douyin",
    brandTone: "clear",
    bannedExpressions: [],
    landingInfo: null,
    assumptions: [],
  };
  const storyboardData = {
    narrative: "show the product in a consistent workspace",
    totalDurationSec: 8,
    shots: [
      {
        index: 0,
        purpose: "hook",
        durationSec: 4,
        scene: "clean desk",
        visualDirection: "slow push toward the product",
        productAssetRef: "product.png",
        voiceover: "整理桌面，从一盏好灯开始。",
        transition: "cut",
      },
      {
        index: 1,
        purpose: "cta",
        durationSec: 4,
        scene: "same clean desk",
        visualDirection: "hold product hero angle",
        productAssetRef: "product.png",
        voiceover: "现在就把光线调到舒服。",
        transition: "fade",
      },
    ],
    assumptions: [],
  };
  const shotPromptData = {
    targetProvider: "seedance",
    durationSec: 8,
    aspectRatio: "9:16",
    prompt: "consistent desk lamp sequence",
    negativePrompt: "",
    shots: [
      {
        index: 0,
        startSec: 0,
        endSec: 4,
        providerPrompt: "clean desk slow push",
        referenceAssetRefs: ["product.png"],
        voiceover: "整理桌面，从一盏好灯开始。",
      },
      {
        index: 1,
        startSec: 4,
        endSec: 8,
        providerPrompt: "same desk hero hold",
        referenceAssetRefs: ["product.png"],
        voiceover: "现在就把光线调到舒服。",
      },
    ],
    tts: { enabled: true, source: "shots.voiceover", voiceover: "整理桌面，从一盏好灯开始。现在就把光线调到舒服。" },
    assumptions: [],
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
      stage: "brief",
      endpoint: `/api/workspaces/${workspaceId}/product-brief/approve`,
      method: "POST",
      actionType: "human_approval",
      requiresHumanApproval: true,
      willCallProvider: false,
      requiresProviderConfig: false,
    },
    materialLibrary: {
      scannedAt: now,
      primaryProductRef: "product.png",
      assets: [],
      rejected: [],
    },
    artifacts: {
      promptRequirements: artifact(
        "prompt-requirements",
        { image: {}, shotImage: {}, shotVideo: {} },
        "approved",
      ),
      material: artifact(
        "material-intake",
        { scannedAt: now, primaryProductRef: "product.png", assets: [], rejected: [] },
        "approved",
      ),
      brief: artifact("product-brief", briefData, briefApproved ? "approved" : "proposed"),
      storyboard: storyboardProposed
        ? artifact("storyboard", storyboardData, storyboardApproved ? "approved" : "proposed")
        : null,
      shotPrompt: shotPromptProposed
        ? artifact("shotprompt", shotPromptData, shotPromptApproved ? "approved" : "proposed")
        : null,
    },
    activeShotSet: shotSetApplied
      ? {
          id: "shotset-1",
          workspaceId,
          shotPromptArtifactId: "shotprompt-approved",
          status: "active",
          sourceFingerprint: {},
          createdAt: now,
          archivedAt: null,
        }
      : null,
  });

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/status`
    ) {
      return json(route, statusBody());
    }
    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shot-workflow-status`
    ) {
      return json(route, {
        data: {
          workspaceId,
          shots: shotSetApplied
            ? [
                {
                  shotId,
                  orderIndex: 0,
                  status: "DRAFT",
                  nextAction: "GENERATE_IMAGE_PROMPT",
                  activeImagePromptArtifactId: null,
                  selectedImageId: null,
                  activeVideoScriptArtifactId: null,
                  selectedVideoId: null,
                },
              ]
            : [],
          canComposeFinalVideo: false,
        },
      });
    }
    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/shots`) {
      return json(route, {
        data: shotSetApplied
          ? [
              {
                id: shotId,
                workspaceId,
                orderIndex: 0,
                title: "Hook",
                objective: "open strong",
                defaultDurationSec: 4,
                status: "DRAFT",
                nextAction: "GENERATE_IMAGE_PROMPT",
                activeImagePromptArtifactId: null,
                selectedImageId: null,
                activeVideoScriptArtifactId: null,
                selectedVideoId: null,
              },
            ]
          : [],
      });
    }
    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/traces`) {
      return json(route, { data: [] });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/product-brief/approve`
    ) {
      briefApproved = true;
      state.approveBriefBody = request.postDataJSON();
      state.calls.push("approve-brief");
      return json(route, { data: artifact("product-brief", briefData, "approved") });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/storyboard/propose`
    ) {
      storyboardProposed = true;
      state.calls.push("propose-storyboard");
      return json(route, { data: artifact("storyboard", storyboardData, "proposed") });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/storyboard/approve`
    ) {
      storyboardApproved = true;
      state.approveStoryboardBody = request.postDataJSON();
      state.calls.push("approve-storyboard");
      return json(route, { data: artifact("storyboard", storyboardData, "approved") });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/shotprompt/propose`
    ) {
      shotPromptProposed = true;
      state.calls.push("propose-shotprompt");
      return json(route, { data: artifact("shotprompt", shotPromptData, "proposed") });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/shotprompt/approve`
    ) {
      shotPromptApproved = true;
      state.approveShotPromptBody = request.postDataJSON();
      state.calls.push("approve-shotprompt");
      return json(route, { data: artifact("shotprompt", shotPromptData, "approved") });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/shot-sets`
    ) {
      shotSetApplied = true;
      state.calls.push("apply-shot-set");
      return json(route, {
        data: {
          id: "shotset-1",
          workspaceId,
          shotPromptArtifactId: "shotprompt-approved",
          status: "active",
          sourceFingerprint: {},
          createdAt: now,
          archivedAt: null,
        },
      });
    }

    return json(route, {});
  };

  await page.route("http://localhost:3000/api/**", handleApiRoute);
  await page.route("http://127.0.0.1:3000/api/**", handleApiRoute);
  await page.route("http://localhost:3100/api/**", handleApiRoute);
  await page.route("http://127.0.0.1:3100/api/**", handleApiRoute);

  return state;
}

test("user can start a managed creative session from the root URL", async ({
  page,
}) => {
  await mockWorkbenchApi(page);
  await page.goto("/");

  await page.getByRole("button", { name: /启动创作会话/ }).click();

  await expect(page).toHaveURL(/\/workspaces\/ws-e2e/);
  await expect(page.getByText("创作审核台")).toBeVisible();
});

test("user can open a chosen working directory", async ({ page }) => {
  await mockWorkbenchApi(page);
  await page.goto("/");

  await page.getByLabel("工作目录路径").fill("/tmp/daireel-e2e");
  await page.getByRole("button", { name: "打开" }).click();

  await expect(page).toHaveURL(/\/workspaces\/ws-e2e/);
  await expect(page.getByText("创作审核台")).toBeVisible();
});

test("review desk starts from requirements and stops at product brief review", async ({
  page,
}) => {
  const calls = await mockReviewStartApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "创作要求 + 上传素材" })).toBeVisible();
  await page.getByLabel("上传素材").setInputFiles({
    name: "product.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByRole("button", { name: /提交创作要求/ })).toBeEnabled();
  await page.getByRole("button", { name: /提交创作要求/ }).click();
  await expect(page.getByRole("heading", { name: "商品卖点审核" })).toBeVisible();
  expect(calls).toEqual([
    "upload-material",
    "propose-requirements",
    "approve-requirements",
    "propose-material",
    "approve-material",
    "propose-brief",
  ]);
});

test("product brief review edits business fields before approving", async ({
  page,
}) => {
  const state = await mockLayeredReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "商品卖点审核" })).toBeVisible();

  await page.getByLabel("商品名称").fill("海滨装饰画");
  await page.getByLabel("核心卖点").fill("自然海滨色调适配客厅");
  await page.getByLabel("落地页信息").fill("旅行详情页提供路线、住宿和价格说明");
  await page.getByLabel("关键假设").fill("用户已确认这是旅行服务\n素材可用于加州路线展示");
  await page.getByRole("button", { name: "提交表单到结构化内容" }).click();

  const payloadView = page.getByLabel("后端 payload（只读）");
  await expect(payloadView).toHaveAttribute("readonly", "");
  await expect(payloadView).toHaveValue(/海滨装饰画/);
  await expect(payloadView).toHaveValue(/自然海滨色调适配客厅/);
  await expect(payloadView).toHaveValue(/旅行详情页提供路线、住宿和价格说明/);
  await expect(payloadView).toHaveValue(/用户已确认这是旅行服务/);
  await expect(payloadView).not.toHaveValue(/old decorative/);

  await page.getByRole("button", { name: /批准商品卖点并生成分镜规划/ }).click();
  await expect.poll(() => state.calls.includes("approve-brief")).toBe(true);
  expect(state.approveBriefBody).toMatchObject({
    data: {
      product: { name: "海滨装饰画" },
      coreSellingPoint: "自然海滨色调适配客厅",
      landingInfo: "旅行详情页提供路线、住宿和价格说明",
      assumptions: ["用户已确认这是旅行服务", "素材可用于加州路线展示"],
    },
  });
});

test("storyboard review edits form fields before approving", async ({ page }) => {
  const state = await mockLayeredReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("button", { name: /批准商品卖点并生成分镜规划/ }).click();
  await expect(page.getByRole("heading", { name: "分镜规划" })).toBeVisible();

  await expect(page.getByText("编辑结构化内容")).toHaveCount(0);
  await page.getByLabel("分镜叙事").fill("先展示旅行目的地，再证明路线体验，最后引导咨询");
  await page.getByLabel("总时长").fill("12");
  await page.getByLabel("Shot 1 场景").fill("加州海岸公路清晨远景");
  await page.getByLabel("Shot 1 画面方向").fill("航拍沿海岸线推进，突出路线辽阔感");
  await page.getByLabel("Shot 1 口播").fill("三天时间，把加州海岸线走进你的假期里。");
  await page.getByLabel("分镜假设").fill("用户已确认旅行服务方向");
  await page.getByRole("button", { name: "提交分镜规划到结构化内容" }).click();

  const payloadView = page.getByLabel("后端 payload（只读）");
  await expect(payloadView).toHaveAttribute("readonly", "");
  await expect(payloadView).toHaveValue(/加州海岸公路清晨远景/);
  await expect(payloadView).toHaveValue(/用户已确认旅行服务方向/);

  await page.getByRole("button", { name: /批准分镜规划并生成分镜生成要求/ }).click();
  await expect.poll(() => state.calls.includes("approve-storyboard")).toBe(true);
  const storyboardBody = state.approveStoryboardBody as {
    data: {
      narrative: string;
      totalDurationSec: number;
      assumptions: string[];
      shots: Array<{ scene: string; visualDirection: string; voiceover: string }>;
    };
  };
  expect(storyboardBody.data).toMatchObject({
    narrative: "先展示旅行目的地，再证明路线体验，最后引导咨询",
    totalDurationSec: 12,
    assumptions: ["用户已确认旅行服务方向"],
  });
  expect(storyboardBody.data.shots[0]).toMatchObject({
    scene: "加州海岸公路清晨远景",
    visualDirection: "航拍沿海岸线推进，突出路线辽阔感",
    voiceover: "三天时间，把加州海岸线走进你的假期里。",
  });
});

test("shotprompt review edits form fields before approving", async ({ page }) => {
  const state = await mockLayeredReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("button", { name: /批准商品卖点并生成分镜规划/ }).click();
  await page.getByRole("button", { name: /批准分镜规划并生成分镜生成要求/ }).click();
  await expect(page.getByRole("heading", { name: "分镜生成要求" })).toBeVisible();

  await expect(page.getByText("编辑结构化内容")).toHaveCount(0);
  await page.getByLabel("全局视频提示词").fill("保持真实旅行 vlog 质感，海岸线和车辆连续");
  await page.getByLabel("负向提示词").fill("不要出现装饰画、墙面、室内陈列");
  await page.getByLabel("Shot 1 生成提示词").fill("沿海公路航拍推进，车辆沿右侧车道前进");
  await page.getByLabel("Shot 1 参考素材").fill("DSC03391.JPG\nDSC03407.JPG");
  await page.getByLabel("Shot 1 口播").fill("从海边出发，三天看完整条路线。");
  await page.getByLabel("TTS 口播").fill("从海边出发，三天看完整条路线。");
  await page.getByLabel("生成要求假设").fill("用户需要旅行服务视频，而不是装饰画视频");
  await page.getByRole("button", { name: "提交分镜生成要求到结构化内容" }).click();

  const payloadView = page.getByLabel("后端 payload（只读）");
  await expect(payloadView).toHaveAttribute("readonly", "");
  await expect(payloadView).toHaveValue(/真实旅行 vlog/);
  await expect(payloadView).toHaveValue(/不要出现装饰画/);
  await expect(payloadView).toHaveValue(/DSC03407.JPG/);

  await page.getByRole("button", { name: /批准分镜生成要求/ }).click();
  await expect.poll(() => state.calls.includes("approve-shotprompt")).toBe(true);
  const shotPromptBody = state.approveShotPromptBody as {
    data: {
      prompt: string;
      negativePrompt: string;
      assumptions: string[];
      tts: { voiceover: string };
      shots: Array<{
        providerPrompt: string;
        referenceAssetRefs: string[];
        voiceover: string;
      }>;
    };
  };
  expect(shotPromptBody.data).toMatchObject({
    prompt: "保持真实旅行 vlog 质感，海岸线和车辆连续",
    negativePrompt: "不要出现装饰画、墙面、室内陈列",
    assumptions: ["用户需要旅行服务视频，而不是装饰画视频"],
    tts: { voiceover: "从海边出发，三天看完整条路线。" },
  });
  expect(shotPromptBody.data.shots[0]).toMatchObject({
    providerPrompt: "沿海公路航拍推进，车辆沿右侧车道前进",
    referenceAssetRefs: ["DSC03391.JPG", "DSC03407.JPG"],
    voiceover: "从海边出发，三天看完整条路线。",
  });
});

test("review desk advances layered approvals into shot production", async ({
  page,
}) => {
  const state = await mockLayeredReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "商品卖点审核" })).toBeVisible();
  await page.getByRole("button", { name: /批准商品卖点并生成分镜规划/ }).click();
  await expect(page.getByRole("heading", { name: "分镜规划" })).toBeVisible();

  await page.getByRole("button", { name: /批准分镜规划并生成分镜生成要求/ }).click();
  await expect(page.getByRole("heading", { name: "分镜生成要求" })).toBeVisible();

  await page.getByRole("button", { name: /批准分镜生成要求/ }).click();
  await expect.poll(() => state.calls.includes("apply-shot-set")).toBe(true);
  await expect(page.getByRole("heading", { name: "分镜图选择" })).toBeVisible({
    timeout: 15_000,
  });
  expect(state.calls).toEqual([
    "approve-brief",
    "propose-storyboard",
    "approve-storyboard",
    "propose-shotprompt",
    "approve-shotprompt",
    "apply-shot-set",
  ]);
});

test("review desk lets users revisit upstream steps after advancing", async ({
  page,
}) => {
  const state = await mockLayeredReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("button", { name: /批准商品卖点并生成分镜规划/ }).click();
  await page.getByRole("button", { name: /批准分镜规划并生成分镜生成要求/ }).click();
  await page.getByRole("button", { name: /批准分镜生成要求/ }).click();
  await expect(page.getByRole("heading", { name: "分镜图选择" })).toBeVisible();

  await page.getByRole("button", { name: /商品卖点审核/ }).click();
  await expect(page.getByRole("heading", { name: "商品卖点审核" })).toBeVisible();
  await page.getByLabel("商品名称").fill("回退修改商品");
  await page.getByRole("button", { name: "提交表单到结构化内容" }).click();
  await page.getByRole("button", { name: /批准商品卖点并生成分镜规划/ }).click();

  await expect
    .poll(() => state.calls.filter((call) => call === "approve-brief").length)
    .toBe(2);
  await expect
    .poll(() => state.calls.filter((call) => call === "propose-storyboard").length)
    .toBe(2);
  expect(state.approveBriefBody).toMatchObject({
    data: {
      product: { name: "回退修改商品" },
    },
  });
});

test("review desk drives image selection and batch video generation", async ({
  page,
}) => {
  const requests = await mockWorkbenchApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "分镜图选择" })).toBeVisible();
  const materialImage = page.locator(".review-asset img").first();
  await expect(materialImage).toHaveJSProperty(
    "src",
    `http://localhost:3000/api/workspaces/${workspaceId}/materials/product.png`,
  );
  await expect
    .poll(() =>
      materialImage.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: /生成分镜图候选/ }).click();
  await expect(page.getByText("SUCCEEDED")).toBeVisible();
  expect(requests.imagePropose).toEqual({});

  await page.locator(".review-candidate").first().click();
  await expect.poll(() => requests.imageSelect).toEqual({
    imageCandidateId: "imc-1",
    imageGenerationBatchId: "imb-1",
  });

  await expect(page.getByRole("button", { name: /批量生成分镜视频候选/ })).toBeEnabled();
  await page.getByRole("button", { name: /批量生成分镜视频候选/ }).click();
  await expect.poll(() => requests.videoPropose).toEqual({});
  await expect(page.getByText("SUCCEEDED")).toBeVisible();
});

test("debug workbench remains available under the debug route", async ({ page }) => {
  await mockWorkbenchApi(page);
  await page.goto(`/debug/workbenches/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "Artifact Pipeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shot Workbench" })).toBeVisible();
});
