import { expect, test, type Page, type Route } from "@playwright/test";

const workspaceId = "ws-e2e";
const shotId = "shot-1";

const now = new Date(0).toISOString();
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

async function mockCreativeReviewApi(
  page: Page,
  options: {
    readyForFinal?: boolean;
    shot1ImageSelectedInitially?: boolean;
    shot2ImageSelectedInitially?: boolean;
  } = {}
) {
  let imageProposed = false;
  let imageSelected =
    options.shot1ImageSelectedInitially ?? options.readyForFinal ?? false;
  const shot2ImageSelected = options.shot2ImageSelectedInitially ?? true;
  let videoProposed = false;
  let finalStarted = false;
  const requests: {
    imagePropose?: unknown;
    imageSelect?: unknown;
    videoPropose?: unknown;
    finalCompose?: unknown;
  } = {};

  const workspace = {
    id: workspaceId,
    localPath: "/tmp/daireel-e2e",
    currentScriptId: "script-e2e",
    status: "shotprompt_approved",
    traceFile: ".daireel/trace/events.jsonl",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now
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
    promptAssembly: { moduleId },
    createdAt: now,
    updatedAt: now,
    approvedAt: now
  });

  const statusBody = () => ({
    workspace,
    manifest: {
      schemaVersion: 1,
      workspaceId,
      currentScriptId: "script-e2e",
      traceFile: ".daireel/trace/events.jsonl"
    },
    nextAction: {
      stage: "shotprompt",
      endpoint: `/api/workspaces/${workspaceId}/shotprompt/approve`,
      method: "POST",
      actionType: "human_approval",
      requiresHumanApproval: false,
      willCallProvider: false,
      requiresProviderConfig: false
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
          included: true
        }
      ],
      rejected: []
    },
    activeShotSet: {
      id: "shotset-1",
      workspaceId,
      shotPromptArtifactId: "sp-1",
      status: "active",
      sourceFingerprint: {},
      createdAt: now,
      archivedAt: null
    },
    artifacts: {
      promptRequirements: artifact("prompt-requirements", {
        image: { style: "clean ecommerce" },
        script: { tone: "clear" },
        storyboard: { rhythm: "fast" },
        shotImage: { global: "preserve scene" },
        shotVideo: { global: "smooth motion" }
      }),
      material: artifact("material-intake", {
        scannedAt: now,
        primaryProductRef: "product.png",
        assets: [],
        rejected: []
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
        assumptions: []
      }),
      storyboard: artifact("storyboard", {
        narrative: "show product",
        totalDurationSec: 8,
        shots: [],
        assumptions: []
      }),
      shotPrompt: artifact("shotprompt", {
        targetProvider: "seedance",
        durationSec: 8,
        aspectRatio: "9:16",
        prompt: "two shot sequence",
        negativePrompt: "",
        shots: [],
        tts: { enabled: false, source: "shots.voiceover", voiceover: "" },
        assumptions: []
      })
    }
  });

  const workflowStatus = () => ({
    data: {
      workspaceId,
      shots: [
        {
          shotId,
          orderIndex: 0,
          status: options.readyForFinal
            ? "VIDEO_SELECTED"
            : videoProposed
            ? "VIDEO_CANDIDATES_READY"
            : imageSelected
              ? "IMAGE_SELECTED"
              : imageProposed
                ? "IMAGE_CANDIDATES_READY"
                : "DRAFT",
          nextAction: options.readyForFinal
            ? "READY_FOR_FINAL_COMPOSE"
            : videoProposed
            ? "SELECT_VIDEO"
            : imageSelected
              ? "GENERATE_VIDEO_SCRIPT"
              : imageProposed
                ? "SELECT_IMAGE"
                : "GENERATE_IMAGE_PROMPT",
          activeImagePromptArtifactId: imageProposed ? "imgp-1" : null,
          selectedImageId: imageSelected ? "imc-1" : null,
          activeVideoScriptArtifactId: videoProposed ? "vsa-1" : null,
          selectedVideoId: options.readyForFinal ? "vdc-1" : null,
          activeImageBatchId: imageProposed ? "imb-1" : null,
          activeVideoBatchId: videoProposed ? "vbb-1" : null
        },
        {
          shotId: "shot-2",
          orderIndex: 1,
          status: shot2ImageSelected ? "IMAGE_SELECTED" : "DRAFT",
          nextAction: shot2ImageSelected
            ? "GENERATE_VIDEO_SCRIPT"
            : "GENERATE_IMAGE_PROMPT",
          activeImagePromptArtifactId: shot2ImageSelected ? "imgp-2" : null,
          selectedImageId: shot2ImageSelected ? "imc-2" : null,
          activeVideoScriptArtifactId: null,
          selectedVideoId: options.readyForFinal ? "vdc-2" : null,
          activeImageBatchId: shot2ImageSelected ? "imb-2" : null,
          activeVideoBatchId: null
        }
      ],
      canComposeFinalVideo: options.readyForFinal ?? false
    }
  });

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith(".png")) {
      return route.fulfill({ contentType: "image/png", body: png });
    }
    if (path.endsWith("/file")) {
      return route.fulfill({ contentType: "video/mp4", body: "" });
    }

    if (request.method() === "GET" && path === "/api/workspaces") {
      return json(route, {
        workspaceRoot: "storage/workspaces",
        workspaces: [],
        discovered: []
      });
    }

    if (request.method() === "POST" && path === "/api/workspaces/directory/select") {
      return json(route, {
        directory: "/tmp/daireel-e2e",
        cancelled: false,
        method: "linux"
      });
    }

    if (request.method() === "POST" && path === "/api/workspaces") {
      return json(route, {
        workspace,
        manifest: {
          schemaVersion: 1,
          workspaceId,
          currentScriptId: "script-e2e",
          traceFile: ".daireel/trace/events.jsonl"
        }
      });
    }

    if (request.method() === "POST" && path === "/api/workspaces/init") {
      return json(route, {
        workspace,
        manifest: {
          schemaVersion: 1,
          workspaceId,
          currentScriptId: "script-e2e",
          traceFile: ".daireel/trace/events.jsonl"
        }
      });
    }

    if (request.method() === "GET" && path === "/api/config/limits") {
      return json(route, {
        data: {
          defaultImageCandidates: 3,
          maxImageCandidatesPerShot: 6,
          defaultVideoCandidates: 1,
          maxVideoCandidatesPerShot: 10,
          generationWorkerConcurrency: 17,
          providerConcurrency: { text: 20, image: 12, video: 5 },
          aspectRatios: ["9:16", "16:9", "1:1"]
        }
      });
    }

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/status`) {
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
            selectedVideoId: null
          }
        ]
      });
    }

    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shots/${shotId}/image-rounds`
    ) {
      return json(route, {
        data: imageProposed || imageSelected
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
                  createdAt: now
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
                  updatedAt: now
                },
                candidates: [
                  {
                    id: "imc-1",
                    imageUrl: `/api/workspaces/${workspaceId}/materials/generated-images/imc-1.png`,
                    status: "SUCCEEDED"
                  }
                ],
                selection: imageSelected
                  ? {
                      selectedCandidateId: "imc-1",
                      selectedAt: now
                    }
                  : null,
                context: {}
              }
            ]
          : []
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
                  createdAt: now
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
                  updatedAt: now
                },
                candidates: [],
                selection: null,
                frames: {
                  firstFrameUrl: `/api/workspaces/${workspaceId}/materials/generated-images/imc-1.png`,
                  lastFrameUrl: null,
                  firstFrameCandidateId: "imc-1",
                  lastFrameCandidateId: null
                },
                context: {}
              }
            ]
          : []
      });
    }

    if (request.method() === "POST" && path === `/api/workspaces/${workspaceId}/final-videos`) {
      finalStarted = true;
      requests.finalCompose = request.postDataJSON();
      return json(route, {
        data: {
          finalVideoJobId: "fvj-1",
          jobId: "job-final-1",
          status: "PENDING"
        }
      });
    }

    if (request.method() === "GET" && path === "/api/final-videos/fvj-1") {
      return json(route, {
        data: {
          id: "fvj-1",
          workspaceId,
          status: finalStarted ? "SUCCEEDED" : "PENDING",
          localUrl: finalStarted
            ? `/api/workspaces/${workspaceId}/final-videos/fvj-1/file`
            : null,
          durationSec: finalStarted ? 8 : null,
          compiledManifestHash: finalStarted ? "abc123" : null,
          errorMessage: null,
          createdAt: now
        }
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
        traceId: "trace-image"
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
        shotStatus: "IMAGE_SELECTED"
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
        traceId: "trace-video"
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
  let materialProposed = false;
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
    lastSeenAt: now
  };

  const artifact = (
    moduleId: string,
    data: unknown,
    status: "proposed" | "approved"
  ) => ({
    id: `${moduleId}-${status}`,
    workspaceId,
    moduleId,
    type: moduleId,
    status,
    isCurrent: status === "approved",
    data,
    sourceFingerprint: {},
    promptAssembly: { moduleId },
    createdAt: now,
    updatedAt: now,
    approvedAt: status === "approved" ? now : null
  });

  const materialData = {
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
        included: true
      }
    ],
    rejected: []
  };
  const briefData = {
    product: {
      name: "Desk Lamp",
      category: "lighting",
      keyFacts: ["soft light"],
      assets: [{ ref: "product.png", useAs: "primary" }]
    },
    audience: { who: "home workers", painOrDesire: "clean desk light" },
    coreSellingPoint: "soft adjustable light",
    proof: ["uploaded product image"],
    offer: null,
    platform: "douyin",
    brandTone: "clear",
    bannedExpressions: [],
    landingInfo: "old decorative product detail page",
    assumptions: ["old decorative wall art assumption"]
  };

  const statusBody = () => ({
    workspace,
    manifest: {
      schemaVersion: 1,
      workspaceId,
      currentScriptId: "script-e2e",
      traceFile: ".daireel/trace/events.jsonl"
    },
    nextAction: {
      stage: "requirements",
      endpoint: `/api/workspaces/${workspaceId}/prompt-requirements/propose`,
      method: "POST",
      actionType: "human_approval",
      requiresHumanApproval: true,
      willCallProvider: false,
      requiresProviderConfig: false
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
              included: true
            }
          ]
        : [],
      rejected: []
    },
    artifacts: {
      promptRequirements: requirementsApproved
        ? artifact(
            "prompt-requirements",
            {
              image: { style: "clean" },
              shotImage: { global: "consistent scene" },
              shotVideo: { global: "smooth motion" }
            },
            "approved"
          )
        : null,
      material: materialApproved
        ? artifact("material-intake", materialData, "approved")
        : materialProposed
          ? artifact("material-intake", materialData, "proposed")
        : null,
      brief: briefProposed ? artifact("product-brief", briefData, "proposed") : null,
      storyboard: null,
      shotPrompt: null
    },
    activeShotSet: null
  });

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === "GET" && path === "/api/workspaces") {
      return json(route, { workspaceRoot: "storage/workspaces", workspaces: [] });
    }
    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/status`) {
      return json(route, statusBody());
    }
    if (
      request.method() === "GET" &&
      path === `/api/workspaces/${workspaceId}/shot-workflow-status`
    ) {
      return json(route, {
        data: { workspaceId, shots: [], canComposeFinalVideo: false }
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/materials`
    ) {
      materialUploaded = true;
      calls.push("upload-material");
      return json(route, {
        workspace,
        material: {
          ref: "product.png",
          bytes: 100,
          url: `/api/workspaces/${workspaceId}/materials/product.png`
        }
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/prompt-requirements/propose`
    ) {
      calls.push("propose-requirements");
      return json(route, {
        data: artifact("prompt-requirements", request.postDataJSON().data, "proposed")
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/prompt-requirements/approve`
    ) {
      requirementsApproved = true;
      calls.push("approve-requirements");
      return json(route, {
        data: artifact(
          "prompt-requirements",
          { image: {}, shotImage: {}, shotVideo: {} },
          "approved"
        )
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/material-intake/propose`
    ) {
      materialProposed = true;
      calls.push("propose-material");
      return json(route, {
        data: artifact("material-intake", materialData, "proposed")
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/material-intake/approve`
    ) {
      materialApproved = true;
      calls.push("approve-material");
      return json(route, {
        data: artifact("material-intake", materialData, "approved")
      });
    }
    if (
      request.method() === "POST" &&
      path === `/api/workspaces/${workspaceId}/product-brief/propose`
    ) {
      briefProposed = true;
      calls.push("propose-brief");
      return json(route, {
        data: artifact("product-brief", briefData, "proposed")
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

async function mockLayeredReviewApi(
  page: Page,
  options: { legacyApprovedShotPrompt?: boolean } = {}
) {
  let briefApproved = Boolean(options.legacyApprovedShotPrompt);
  let storyboardProposed = Boolean(options.legacyApprovedShotPrompt);
  let storyboardApproved = Boolean(options.legacyApprovedShotPrompt);
  let shotPromptProposed = Boolean(options.legacyApprovedShotPrompt);
  let shotPromptApproved = Boolean(options.legacyApprovedShotPrompt);
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
    status: options.legacyApprovedShotPrompt ? "shotprompt_approved" : "brief_proposed",
    traceFile: ".daireel/trace/events.jsonl",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now
  };

  const artifact = (
    moduleId: string,
    data: unknown,
    status: "proposed" | "approved"
  ) => ({
    id: `${moduleId}-${status}`,
    workspaceId,
    moduleId,
    type: moduleId,
    status,
    isCurrent: status === "approved",
    data,
    sourceFingerprint: {},
    promptAssembly: { moduleId },
    createdAt: now,
    updatedAt: now,
    approvedAt: status === "approved" ? now : null
  });

  const briefData = {
    product: {
      name: "Desk Lamp",
      category: "lighting",
      keyFacts: ["soft light"],
      assets: [{ ref: "product.png", useAs: "primary" }]
    },
    audience: { who: "home workers", painOrDesire: "clean desk light" },
    coreSellingPoint: "soft adjustable light",
    proof: ["uploaded product image"],
    offer: null,
    platform: "douyin",
    brandTone: "clear",
    bannedExpressions: [],
    landingInfo: null,
    assumptions: []
  };
  const storyboardData = {
    narrative: "show the product in a consistent workspace",
    totalDurationSec: 15,
    shots: [
      {
        index: 0,
        purpose: "hook",
        durationSec: 4,
        scene: "clean desk",
        visualDirection: "slow push toward the product",
        productAssetRef: "product.png",
        voiceover: "整理桌面，从一盏好灯开始。",
        transition: "cut"
      },
      {
        index: 1,
        purpose: "proof",
        durationSec: 7,
        scene: "same clean desk with lamp detail",
        visualDirection: "show soft adjustable light on the desk",
        productAssetRef: "product.png",
        voiceover: "柔和光线减少桌面杂乱。",
        transition: "cut"
      },
      {
        index: 2,
        purpose: "cta",
        durationSec: 4,
        scene: "same clean desk",
        visualDirection: "hold product hero angle",
        productAssetRef: "product.png",
        voiceover: "现在就把光线调到舒服。",
        transition: "fade"
      }
    ],
    assumptions: []
  };
  const shotPromptData = {
    targetProvider: "seedance",
    durationSec: 15,
    aspectRatio: "9:16",
    prompt: "consistent desk lamp three-shot sequence",
    negativePrompt: "",
    shots: [
      {
        index: 0,
        startSec: 0,
        endSec: 4,
        providerPrompt: "clean desk slow push",
        referenceAssetRefs: ["product.png"],
        voiceover: "整理桌面，从一盏好灯开始。",
        shotImage: {
          scene: "干净桌面上的台灯",
          composition: "产品居中，桌面留白",
          lighting: "真实自然光照亮桌面",
          productVisibility: "台灯轮廓完整可见",
          referenceUsage: "参考 product.png 保持台灯外观",
          style: "真实自然光",
          negative: ["室内杂物", "产品变形"]
        },
        shotVideo: {
          cameraMotion: "缓慢推进",
          subjectMotion: "台灯保持静止",
          firstFrameIntent: "产品完整入画",
          lastFrameIntent: "停在灯罩细节",
          durationIntent: "4 秒内完成缓慢推进",
          continuity: "光线保持一致",
          negative: ["镜头抖动", "手指遮挡"]
        }
      },
      {
        index: 1,
        startSec: 4,
        endSec: 11,
        providerPrompt: "same desk lamp proof detail",
        referenceAssetRefs: ["product.png"],
        voiceover: "柔和光线减少桌面杂乱。",
        shotImage: {
          scene: "桌面台灯细节与柔和光线",
          composition: "灯罩和桌面光斑清楚可见",
          lighting: "柔和自然光叠加灯光",
          productVisibility: "台灯细节完整可见",
          referenceUsage: "参考 product.png 保持台灯身份",
          style: "干净可信",
          negative: ["画面过曝", "商品变形"]
        },
        shotVideo: {
          cameraMotion: "轻微横移",
          subjectMotion: "光线自然变化",
          firstFrameIntent: "承接上一镜头台灯主体",
          lastFrameIntent: "停在桌面柔和光线",
          durationIntent: "7 秒内展示光线证明",
          continuity: "桌面方向一致",
          negative: ["跳切", "色温漂移"]
        }
      },
      {
        index: 2,
        startSec: 11,
        endSec: 15,
        providerPrompt: "same desk hero hold",
        referenceAssetRefs: ["product.png"],
        voiceover: "现在就把光线调到舒服。",
        shotImage: {
          scene: "同一桌面上的台灯 hero 角度",
          composition: "产品略偏右，保留按钮区域",
          lighting: "柔和自然光稳定",
          productVisibility: "品牌和灯罩完整可见",
          referenceUsage: "参考 product.png 保持灯罩比例",
          style: "柔和清爽",
          negative: ["画面过曝", "背景混乱"]
        },
        shotVideo: {
          cameraMotion: "固定机位",
          subjectMotion: "灯光逐渐变亮",
          firstFrameIntent: "承接上一镜头桌面",
          lastFrameIntent: "停留在舒适光线",
          durationIntent: "4 秒内完成灯光变化",
          continuity: "桌面方向一致",
          negative: ["跳切", "色温漂移"]
        }
      }
    ],
    tts: {
      enabled: true,
      source: "shots.voiceover",
      voiceover: "整理桌面，从一盏好灯开始。柔和光线减少桌面杂乱。现在就把光线调到舒服。"
    },
    assumptions: []
  };
  const legacyStoryboardData = {
    narrative: "legacy four-shot sequence",
    totalDurationSec: 14,
    shots: [
      {
        index: 0,
        purpose: "hook",
        durationSec: 3,
        scene: "legacy hook",
        visualDirection: "old hook direction",
        productAssetRef: "product.png",
        voiceover: "旧开场",
        transition: "cut"
      },
      {
        index: 1,
        purpose: "benefit",
        durationSec: 4,
        scene: "legacy benefit",
        visualDirection: "old benefit direction",
        productAssetRef: "product.png",
        voiceover: "旧卖点",
        transition: "cut"
      },
      {
        index: 2,
        purpose: "proof",
        durationSec: 4,
        scene: "legacy proof",
        visualDirection: "old proof direction",
        productAssetRef: "product.png",
        voiceover: "旧证明",
        transition: "cut"
      },
      {
        index: 3,
        purpose: "cta",
        durationSec: 3,
        scene: "legacy cta",
        visualDirection: "old cta direction",
        productAssetRef: "product.png",
        voiceover: "旧行动号召",
        transition: "fade"
      }
    ],
    assumptions: []
  };
  const legacyShotPromptData = {
    ...shotPromptData,
    durationSec: 14,
    prompt: "legacy four-shot shotprompt",
    shots: [
      ...shotPromptData.shots,
      {
        index: 3,
        startSec: 11,
        endSec: 14,
        providerPrompt: "legacy fourth shot should not be shown",
        referenceAssetRefs: ["product.png"],
        voiceover: "旧行动号召",
        shotImage: {
          scene: "旧第四镜画面",
          composition: "旧构图",
          lighting: "旧光线",
          productVisibility: "旧商品呈现",
          referenceUsage: "旧参考",
          negative: []
        },
        shotVideo: {
          cameraMotion: "旧镜头运动",
          subjectMotion: "旧主体运动",
          firstFrameIntent: "旧首帧",
          lastFrameIntent: "旧末帧",
          durationIntent: "旧时长",
          continuity: "旧连续性",
          negative: []
        }
      }
    ],
    tts: {
      enabled: true,
      source: "shots.voiceover",
      voiceover: "旧开场旧卖点旧证明旧行动号召"
    }
  };

  const statusBody = () => ({
    workspace,
    manifest: {
      schemaVersion: 1,
      workspaceId,
      currentScriptId: "script-e2e",
      traceFile: ".daireel/trace/events.jsonl"
    },
    nextAction: {
      stage: "brief",
      endpoint: `/api/workspaces/${workspaceId}/product-brief/approve`,
      method: "POST",
      actionType: "human_approval",
      requiresHumanApproval: true,
      willCallProvider: false,
      requiresProviderConfig: false
    },
    materialLibrary: {
      scannedAt: now,
      primaryProductRef: "product.png",
      assets: [],
      rejected: []
    },
    artifacts: {
      promptRequirements: artifact(
        "prompt-requirements",
        { image: {}, shotImage: {}, shotVideo: {} },
        "approved"
      ),
      material: artifact(
        "material-intake",
        { scannedAt: now, primaryProductRef: "product.png", assets: [], rejected: [] },
        "approved"
      ),
      brief: artifact(
        "product-brief",
        briefData,
        briefApproved ? "approved" : "proposed"
      ),
      storyboard: storyboardProposed
        ? artifact(
            "storyboard",
            options.legacyApprovedShotPrompt ? legacyStoryboardData : storyboardData,
            storyboardApproved ? "approved" : "proposed"
          )
        : null,
      shotPrompt: shotPromptProposed
        ? artifact(
            "shotprompt",
            options.legacyApprovedShotPrompt ? legacyShotPromptData : shotPromptData,
            shotPromptApproved ? "approved" : "proposed"
          )
        : null
    },
    activeShotSet: shotSetApplied
      ? {
          id: "shotset-1",
          workspaceId,
          shotPromptArtifactId: "shotprompt-approved",
          status: "active",
          sourceFingerprint: {},
          createdAt: now,
          archivedAt: null
        }
      : null
  });

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === "GET" && path === `/api/workspaces/${workspaceId}/status`) {
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
                  selectedVideoId: null
                }
              ]
            : [],
          canComposeFinalVideo: false
        }
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
                selectedVideoId: null
              }
            ]
          : []
      });
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
          archivedAt: null
        }
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

test("user can start a managed creative session from the root URL", async ({ page }) => {
  await mockCreativeReviewApi(page);
  await page.goto("/");

  await page.getByRole("button", { name: /启动创作会话/ }).click();

  await expect(page).toHaveURL(/\/workspaces\/ws-e2e/);
  await expect(page.getByText("创作审核台")).toBeVisible();
});

test("user can open a chosen working directory", async ({ page }) => {
  await mockCreativeReviewApi(page);
  await page.goto("/");

  await page.getByLabel("工作目录路径").fill("/tmp/daireel-e2e");
  await page.getByRole("button", { name: "打开" }).click();

  await expect(page).toHaveURL(/\/workspaces\/ws-e2e/);
  await expect(page.getByText("创作审核台")).toBeVisible();
});

test("review desk starts from requirements and stops at material intake review", async ({
  page
}) => {
  const calls = await mockReviewStartApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "创作要求 + 上传素材" })).toBeVisible();
  await page.getByLabel("上传素材").setInputFiles({
    name: "product.png",
    mimeType: "image/png",
    buffer: png
  });
  await expect(page.getByRole("button", { name: /提交创作要求/ })).toBeEnabled();
  await page.getByRole("button", { name: /提交创作要求/ }).click();
  await expect(page.getByRole("heading", { name: "素材解读" })).toBeVisible();
  await page.getByLabel("解读说明").fill("主商品正面图，瓶身和包装文字清晰");
  await page.getByRole("button", { name: /批准素材解读并生成商品卖点/ }).click();
  await expect(page.getByRole("heading", { name: "商品卖点审核" })).toBeVisible();
  expect(calls).toEqual([
    "upload-material",
    "propose-requirements",
    "approve-requirements",
    "propose-material",
    "approve-material",
    "propose-brief"
  ]);
});

test("product brief review edits business fields before approving", async ({ page }) => {
  const state = await mockLayeredReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "商品卖点审核" })).toBeVisible();

  await page.getByLabel("商品名称").fill("海滨装饰画");
  await page.getByLabel("核心卖点").fill("自然海滨色调适配客厅");
  await page.getByLabel("落地页信息").fill("旅行详情页提供路线、住宿和价格说明");
  await page
    .getByLabel("关键假设")
    .fill("用户已确认这是旅行服务\n素材可用于加州路线展示");
  await page.getByRole("button", { name: "提交表单到结构化内容" }).click();

  const payloadView = page.getByLabel("后端 payload（只读）");
  await expect(payloadView).toHaveAttribute("readonly", "");
  await expect(payloadView).toHaveValue(/海滨装饰画/);
  await expect(payloadView).toHaveValue(/自然海滨色调适配客厅/);
  await expect(payloadView).toHaveValue(/旅行详情页提供路线、住宿和价格说明/);
  await expect(payloadView).toHaveValue(/用户已确认这是旅行服务/);
  await expect(payloadView).not.toHaveValue(/old decorative/);

  await page.getByRole("button", { name: /批准商品卖点并生成分镜脚本/ }).click();
  await expect.poll(() => state.calls.includes("approve-brief")).toBe(true);
  expect(state.approveBriefBody).toMatchObject({
    data: {
      product: { name: "海滨装饰画" },
      coreSellingPoint: "自然海滨色调适配客厅",
      landingInfo: "旅行详情页提供路线、住宿和价格说明",
      assumptions: ["用户已确认这是旅行服务", "素材可用于加州路线展示"]
    }
  });
});

test("storyboard review edits form fields before approving", async ({ page }) => {
  const state = await mockLayeredReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("button", { name: /批准商品卖点并生成分镜脚本/ }).click();
  await expect(page.getByRole("heading", { name: "分镜脚本" })).toBeVisible();

  await expect(page.getByText("编辑结构化内容")).toHaveCount(0);
  await page.getByRole("button", { name: "调整分镜结构" }).click();
  await page
    .getByLabel("分镜叙事")
    .fill("先展示旅行目的地，再证明路线体验，最后引导咨询");
  await page.getByLabel("分镜假设").fill("用户已确认旅行服务方向");
  await page.getByRole("button", { name: /开场钩子/ }).last().click();
  await page.getByLabel("分镜 1 场景").fill("加州海岸公路清晨远景");
  await page.getByLabel("分镜 1 画面方向").fill("航拍沿海岸线推进，突出路线辽阔感");

  await page.getByRole("button", { name: "编辑口播与画面意图" }).first().click();
  await page
    .getByRole("textbox", { name: "口播文案" })
    .first()
    .fill("三天时间，把海岸线走进假期。");

  await page.getByRole("button", { name: "批准生效" }).click();
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
    totalDurationSec: 15,
    assumptions: ["用户已确认旅行服务方向"]
  });
  expect(storyboardBody.data.shots[0]).toMatchObject({
    scene: "加州海岸公路清晨远景",
    visualDirection: "航拍沿海岸线推进，突出路线辽阔感",
    voiceover: "三天时间，把海岸线走进假期。"
  });
});

test("shotprompt review edits form fields before approving", async ({ page }) => {
  const state = await mockLayeredReviewApi(page);

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("button", { name: /批准商品卖点并生成分镜脚本/ }).click();
  await expect(page.getByRole("heading", { name: "分镜脚本" })).toBeVisible();
  await page.getByRole("button", { name: "批准生效" }).click();
  await expect(page.getByRole("heading", { name: "分镜生成要求" })).toBeVisible();

  await expect(page.getByText("编辑结构化内容")).toHaveCount(0);
  await expect(page.getByLabel("全片分镜生成要求表单")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "编辑镜头要求" })).toHaveCount(0);
  await expect(page.getByText("干净桌面上的台灯")).toBeVisible();
  await expect(page.getByText("缓慢推进", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "编辑全片要求" }).click();
  const summaryForm = page.getByLabel("全片分镜生成要求表单");
  await expect(summaryForm.getByLabel("全片口播")).toHaveCount(0);
  await expect(summaryForm.getByLabel("生成要求假设")).toHaveCount(0);
  await summaryForm.getByLabel("画幅").selectOption("16:9");
  await summaryForm
    .getByLabel("全片生成要求")
    .fill("保持真实旅行 vlog 质感，海岸线和车辆连续");
  await summaryForm.getByLabel("负向约束").fill("不要出现装饰画、墙面、室内陈列");
  await page.getByRole("button", { name: "保存全片要求" }).click();

  const firstShotCard = page.locator(".shotprompt-card").first();
  await firstShotCard.getByRole("button", { name: "编辑镜头目标" }).click();
  const goalForm = firstShotCard.getByRole("group", {
    name: "编辑分镜 1 镜头目标",
  });
  await expect(goalForm).toBeVisible();

  const readShotpromptLayout = async () => {
    const cardBodyBox = await firstShotCard
      .locator(".shotprompt-card__body")
      .boundingBox();
    const goalSummaryBox = await firstShotCard
      .locator(".shotprompt-provider")
      .boundingBox();
    const goalTitleBox = await goalForm.getByRole("heading").boundingBox();
    const goalFieldBox = await goalForm
      .locator(".MuiFormControl-root")
      .first()
      .boundingBox();
    const goalFormBox = await goalForm.boundingBox();
    const imageSummaryBox = await firstShotCard
      .locator(".shotprompt-dict")
      .filter({ hasText: "分镜图要求" })
      .boundingBox();
    const videoSummaryBox = await firstShotCard
      .locator(".shotprompt-dict")
      .filter({ hasText: "分镜视频要求" })
      .boundingBox();
    if (
      !cardBodyBox ||
      !goalSummaryBox ||
      !goalTitleBox ||
      !goalFieldBox ||
      !goalFormBox ||
      !imageSummaryBox ||
      !videoSummaryBox
    ) {
      throw new Error("Shotprompt layout boxes should be measurable");
    }
    return {
      body: cardBodyBox,
      goalSummary: goalSummaryBox,
      goalTitle: goalTitleBox,
      goalField: goalFieldBox,
      goal: goalFormBox,
      imageSummary: imageSummaryBox,
      videoSummary: videoSummaryBox,
    };
  };

  await expect
    .poll(async () => {
      const boxes = await readShotpromptLayout();
      return boxes.goal.width / boxes.body.width;
    })
    .toBeGreaterThan(0.9);
  await expect
    .poll(async () => {
      const boxes = await readShotpromptLayout();
      return boxes.goal.y - (boxes.goalSummary.y + boxes.goalSummary.height);
    })
    .toBeGreaterThanOrEqual(-1);
  await expect
    .poll(async () => {
      const boxes = await readShotpromptLayout();
      return boxes.goalField.y - (boxes.goalTitle.y + boxes.goalTitle.height);
    })
    .toBeGreaterThanOrEqual(8);
  await expect
    .poll(async () => {
      const boxes = await readShotpromptLayout();
      return boxes.imageSummary.y - (boxes.goal.y + boxes.goal.height);
    })
    .toBeGreaterThanOrEqual(-1);
  await expect
    .poll(async () => {
      const boxes = await readShotpromptLayout();
      return boxes.videoSummary.y - (boxes.goal.y + boxes.goal.height);
    })
    .toBeGreaterThanOrEqual(-1);
  const stableLayout = await readShotpromptLayout();

  await page.getByRole("button", { name: "编辑分镜视频要求" }).first().click();
  const videoForm = page.getByRole("group", { name: "编辑分镜 1 分镜视频要求" });
  await expect(videoForm).toBeVisible();
  await expect
    .poll(async () => {
      const videoFormBox = await videoForm.boundingBox();
      const boxes = await readShotpromptLayout();
      if (!videoFormBox) {
        throw new Error("Shotprompt video editor box should be measurable");
      }
      return Math.abs(videoFormBox.x - boxes.videoSummary.x);
    })
    .toBeLessThan(24);
  await expect
    .poll(async () => {
      const videoFormBox = await videoForm.boundingBox();
      if (!videoFormBox) {
        throw new Error("Shotprompt video editor box should be measurable");
      }
      return videoFormBox.x - (stableLayout.body.x + stableLayout.body.width * 0.45);
    })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "编辑分镜图要求" }).first().click();
  const imageForm = page.getByRole("group", { name: "编辑分镜 1 分镜图要求" });
  await expect(imageForm).toBeVisible();

  const readRequirementEditorBoxes = async () => {
    const imageFormBox = await imageForm.boundingBox();
    const videoFormBox = await videoForm.boundingBox();
    if (!imageFormBox || !videoFormBox) {
      throw new Error("Shotprompt requirement editor boxes should be measurable");
    }
    return { image: imageFormBox, video: videoFormBox };
  };
  await expect
    .poll(async () => {
      const boxes = await readRequirementEditorBoxes();
      return boxes.image.y - (stableLayout.goal.y + stableLayout.goal.height);
    })
    .toBeGreaterThanOrEqual(-1);
  await expect
    .poll(async () => {
      const boxes = await readRequirementEditorBoxes();
      return boxes.video.y - (stableLayout.goal.y + stableLayout.goal.height);
    })
    .toBeGreaterThanOrEqual(-1);
  await expect
    .poll(async () => {
      const boxes = await readRequirementEditorBoxes();
      return boxes.video.x - boxes.image.x;
    })
    .toBeGreaterThan(stableLayout.body.width * 0.4);

  await imageForm.getByLabel("场景").fill("");
  await imageForm.getByRole("button", { name: "保存分镜图要求" }).click();
  await expect(imageForm.getByText("必填")).toBeVisible();

  await imageForm.getByLabel("场景").fill("加州海岸公路清晨远景");
  await imageForm.getByLabel("商品呈现").fill("旅行车辆与海岸线完整可见");
  await imageForm.getByLabel("负向约束").fill("画面模糊\n商品变形");
  await imageForm.getByRole("button", { name: "保存分镜图要求" }).click();
  await expect(imageForm).toBeHidden();
  await expect(
    page.getByRole("definition").filter({ hasText: "加州海岸公路清晨远景" }),
  ).toBeVisible();

  await videoForm.getByLabel("镜头运动").fill("航拍镜头缓慢推进");
  await videoForm.getByLabel("时长节奏").fill("4 秒内保持平稳推进");
  await videoForm.getByRole("button", { name: "保存分镜视频要求" }).click();
  await expect(videoForm).toBeHidden();
  await expect(
    page.getByRole("definition").filter({ hasText: "航拍镜头缓慢推进" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /批准分镜生成要求/ }).click();
  await expect.poll(() => state.calls.includes("approve-shotprompt")).toBe(true);
  const shotPromptBody = state.approveShotPromptBody as {
    data: {
      aspectRatio: string;
      prompt: string;
      negativePrompt: string;
      assumptions: string[];
      tts: { voiceover: string };
      shots: Array<{
        providerPrompt: string;
        referenceAssetRefs: string[];
        voiceover: string;
        shotImage: {
          scene: string;
          productVisibility: string;
          negative: string[];
        };
        shotVideo: { cameraMotion: string; durationIntent: string };
      }>;
    };
  };
  expect(shotPromptBody.data).toMatchObject({
    aspectRatio: "16:9",
    prompt: "保持真实旅行 vlog 质感，海岸线和车辆连续",
    negativePrompt: "不要出现装饰画、墙面、室内陈列",
    assumptions: [],
    tts: {
      voiceover:
        "整理桌面，从一盏好灯开始。\n柔和光线减少桌面杂乱。\n现在就把光线调到舒服。"
    }
  });
  expect(shotPromptBody.data.shots[0]).toMatchObject({
    providerPrompt: "clean desk slow push",
    referenceAssetRefs: ["product.png"],
    voiceover: "整理桌面，从一盏好灯开始。"
  });
  expect(shotPromptBody.data.shots[0].shotImage).toMatchObject({
    scene: "加州海岸公路清晨远景",
    productVisibility: "旅行车辆与海岸线完整可见",
    negative: ["画面模糊", "商品变形"]
  });
  expect(shotPromptBody.data.shots[0].shotVideo).toMatchObject({
    cameraMotion: "航拍镜头缓慢推进",
    durationIntent: "4 秒内保持平稳推进"
  });
});

test("shotprompt review blocks legacy four-shot upstream before showing old requirements", async ({
  page
}) => {
  await mockLayeredReviewApi(page, { legacyApprovedShotPrompt: true });

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("button", { name: /分镜生成要求/ }).click();

  await expect(page.getByRole("heading", { name: "分镜生成要求" })).toBeVisible();
  await expect(page.getByText("请先批准三镜分镜脚本。")).toBeVisible();
  await expect(page.getByText("legacy fourth shot should not be shown")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /批准分镜生成要求/ })).toHaveCount(0);
});

test("review desk advances layered approvals into shot production", async ({ page }) => {
  const state = await mockLayeredReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "商品卖点审核" })).toBeVisible();
  await page.getByRole("button", { name: /批准商品卖点并生成分镜脚本/ }).click();
  await expect(page.getByRole("heading", { name: "分镜脚本" })).toBeVisible();

  await page.getByRole("button", { name: "批准生效" }).click();
  await expect(page.getByRole("heading", { name: "分镜生成要求" })).toBeVisible();

  await page.getByRole("button", { name: /批准分镜生成要求/ }).click();
  await expect(page.getByRole("heading", { name: "应用分镜" })).toBeVisible();
  await expect.poll(() => state.calls.includes("apply-shot-set")).toBe(false);
  await page.getByRole("button", { name: /创建分镜链路实例/ }).click();
  await expect.poll(() => state.calls.includes("apply-shot-set")).toBe(true);
  await expect(page.getByRole("heading", { name: "分镜图选择" })).toBeVisible({
    timeout: 15_000
  });
  expect(state.calls).toEqual([
    "approve-brief",
    "propose-storyboard",
    "approve-storyboard",
    "propose-shotprompt",
    "approve-shotprompt",
    "apply-shot-set"
  ]);
});

test("review desk lets users revisit upstream steps after advancing", async ({
  page
}) => {
  const state = await mockLayeredReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("button", { name: /批准商品卖点并生成分镜脚本/ }).click();
  await page.getByRole("button", { name: "批准生效" }).click();
  await page.getByRole("button", { name: /批准分镜生成要求/ }).click();
  await page.getByRole("button", { name: /创建分镜链路实例/ }).click();
  await expect(page.getByRole("heading", { name: "分镜图选择" })).toBeVisible();

  await page.getByRole("button", { name: /商品卖点审核/ }).click();
  await expect(page.getByRole("heading", { name: "商品卖点审核" })).toBeVisible();
  await page.getByLabel("商品名称").fill("回退修改商品");
  await page.getByRole("button", { name: "提交表单到结构化内容" }).click();
  await page.getByRole("button", { name: /批准商品卖点并生成分镜脚本/ }).click();

  await expect
    .poll(() => state.calls.filter((call) => call === "approve-brief").length)
    .toBe(2);
  await expect
    .poll(() => state.calls.filter((call) => call === "propose-storyboard").length)
    .toBe(2);
  expect(state.approveBriefBody).toMatchObject({
    data: {
      product: { name: "回退修改商品" }
    }
  });
});

test("review desk drives image selection and batch video generation", async ({
  page
}) => {
  const requests = await mockCreativeReviewApi(page);

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "分镜图选择" })).toBeVisible();
  const materialImage = page.locator(".review-asset img").first();
  await expect(materialImage).toHaveJSProperty(
    "src",
    `http://localhost:3000/api/workspaces/${workspaceId}/materials/product.png`
  );
  await expect
    .poll(() =>
      materialImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: /生成分镜图候选/ }).click();
  await expect(page.getByText("SUCCEEDED")).toBeVisible();
  expect(requests.imagePropose).toEqual({});

  await page.locator(".review-candidate").first().click();
  await page.getByRole("button", { name: /确认选择/ }).click();
  await expect
    .poll(() => requests.imageSelect)
    .toEqual({
      imageCandidateId: "imc-1",
      imageGenerationBatchId: "imb-1"
    });

  await expect(page.getByRole("button", { name: /批量生成分镜视频候选/ })).toBeEnabled();
  await page.getByRole("button", { name: /批量生成分镜视频候选/ }).click();
  await expect.poll(() => requests.videoPropose).toEqual({});
  await expect(page.getByText("SUCCEEDED")).toBeVisible();
});

test("review desk keeps a manually selected previous image shot visible", async ({
  page
}) => {
  await mockCreativeReviewApi(page, {
    shot1ImageSelectedInitially: true,
    shot2ImageSelectedInitially: false
  });

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "分镜图选择" })).toBeVisible();
  const currentShot = page.locator(".review-current-shot strong");
  await expect(currentShot).toHaveText("分镜 2");

  await page.locator(".review-shot-nav__item").first().click();
  await expect(currentShot).toHaveText("分镜 1");
  await page.waitForTimeout(150);
  await expect(currentShot).toHaveText("分镜 1");
});

test("review desk exposes a final video download link after compose succeeds", async ({
  page
}) => {
  const requests = await mockCreativeReviewApi(page, { readyForFinal: true });

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByRole("heading", { name: "生成成片" })).toBeVisible();

  await page.getByRole("button", { name: "生成成片", exact: true }).click();
  await expect.poll(() => requests.finalCompose).toEqual({
    outputAspectRatio: "9:16"
  });

  const download = page.getByRole("link", { name: /下载 MP4/ });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute(
    "href",
    `http://localhost:3000/api/workspaces/${workspaceId}/final-videos/fvj-1/file`
  );
});
