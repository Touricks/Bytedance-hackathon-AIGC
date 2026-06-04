#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const args = new Map();
for (const arg of process.argv.slice(2)) {
  if (arg === "--") continue;
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  args.set(key, value);
}

const liveBaseUrl =
  args.get("base-url") ??
  process.env.FRONTEND_BACKEND_CONTRACT_BASE_URL ??
  "http://127.0.0.1:3000";
const runLive =
  args.has("live") || process.env.FRONTEND_BACKEND_CONTRACT_LIVE === "1";
const strictSource = args.has("strict-source");
const writeIssues = args.has("write-issues");

const workspaceId = "workspace_contract_demo";
const shotSetId = "shot_set_contract_demo";
const shotId = "shot_contract_001";
const imagePromptId = "image_prompt_contract_001";
const imageBatchId = "image_batch_contract_001";
const imageCandidateId = "image_candidate_contract_001";
const videoScriptId = "video_script_contract_001";
const videoBatchId = "video_batch_contract_001";
const videoCandidateId = "video_candidate_contract_001";
const finalVideoJobId = "final_video_contract_001";
const now = "2026-06-02T00:00:00.000Z";

function workspace() {
  return {
    id: workspaceId,
    localPath: "/tmp/aigc-contract-workspace",
    currentScriptId: "script_contract_demo",
    status: "shotprompt_approved",
    traceFile: ".daireel/trace/events.jsonl",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
}

function manifest() {
  return {
    schemaVersion: 1,
    workspaceId,
    currentScriptId: "script_contract_demo",
    traceFile: ".daireel/trace/events.jsonl",
  };
}

function moduleArtifact(moduleId, data, status = "approved") {
  return {
    id: `${moduleId}_artifact_contract`,
    workspaceId,
    moduleId,
    type: moduleId,
    status,
    isCurrent: status === "approved",
    data,
    sourceFingerprint: {
      promptRequirementsArtifactId: "prompt-requirements_artifact_contract",
    },
    promptAssembly: {
      moduleId,
      assemblerVersion: "contract-check.v1",
      subjectTemplateId: `${moduleId}/subject.md`,
      contractTemplateId: `${moduleId}/contract.md`,
      subjectHash: "sha256:subject",
      contractHash: "sha256:contract",
    },
    createdAt: now,
    updatedAt: now,
    approvedAt: status === "approved" ? now : null,
  };
}

const promptRequirements = {
  image: { style: "clean product photography" },
  script: { tone: "credible and concise" },
  storyboard: { rhythm: "hook-proof-cta" },
  shotImage: { global: "keep product identity stable" },
  shotVideo: { global: "smooth motion" },
};

const creativeRequirementTemplates = [
  {
    id: "real-product-demo",
    name: "真实商品讲解",
    summary: "真实电商摄影，卖点清晰，前后镜头连续。",
    values: {
      imageStyle: "真实电商产品摄影，保留商品材质和品牌识别",
      imageComposition: "干净主视觉，主体稳定，避免无关道具抢占画面",
      imageAvoid: "文字贴片，商品变形，额外产品变体，环境漂移",
      scriptTone: "直接、可信、卖点清晰",
      storyboardRhythm: "开场快，卖点明确，证明充分，结尾行动引导清楚",
      shotImageGlobal: "每张分镜图延续前一镜环境、灯光、构图和商品身份",
      shotVideoGlobal: "镜头运动平滑，前后镜头保持空间连续",
    },
  },
  {
    id: "ugc-seeding",
    name: "口播种草转化",
    summary: "自然 UGC 实拍，亲切体验语气，痛点到购买理由。",
    values: {
      imageStyle: "自然 UGC 实拍质感，保留商品真实外观、材质和使用场景",
      imageComposition: "人物或手部互动自然，商品始终是画面焦点，背景生活化但不杂乱",
      imageAvoid: "硬广摆拍，夸张滤镜，商品变形，字幕贴片，虚假前后对比",
      scriptTone: "亲切、真实、有体验感，像朋友推荐但卖点明确",
      storyboardRhythm: "先提出痛点或欲望，再展示使用体验和关键卖点，最后给出购买理由",
      shotImageGlobal: "分镜图保持真实生活场景连续，商品露出稳定，人物动作自然可信",
      shotVideoGlobal: "镜头运动轻量自然，贴近手机实拍观感，动作和口播节奏一致",
    },
  },
  {
    id: "premium-showcase",
    name: "高端质感展示",
    summary: "商业质感，克制专业语气，慢速稳定运镜。",
    values: {
      imageStyle: "高端商业产品摄影，质感精致，材质、反光和轮廓表现清楚",
      imageComposition: "主体居中或黄金分割构图，留白克制，背景干净，光影有层次",
      imageAvoid: "廉价影棚感，过度饱和，杂乱道具，商品变形，低清晰度纹理",
      scriptTone: "克制、专业、有质感，强调价值感和可信证据",
      storyboardRhythm: "开场建立质感，中段展示细节和证据，结尾用简洁行动引导收束",
      shotImageGlobal: "分镜图统一高端光线、色调和商品身份，细节特写必须保持材质真实",
      shotVideoGlobal: "运镜慢速稳定，强调细节、光影和空间连续，不做突兀转场",
    },
  },
];

const materialIntake = {
  primaryProductRef: "product.png",
  assets: [
    {
      ref: "product.png",
      kind: "image",
      role: "primary_product",
      description: "Hero product image",
      relevance: 0.95,
      usable: true,
      included: true,
      tags: ["product", "hero"],
    },
  ],
  summary: "One usable product material.",
};

const productBrief = {
  title: "Contract Demo Product",
  audience: "Online shoppers",
  sellingPoints: ["Compact", "Reliable"],
  style: "direct",
  constraints: [],
};

const storyboard = {
  narrative: "Show the product, prove the value, close clearly.",
  totalDurationSec: 12,
  assumptions: [],
  shots: [
    {
      id: "storyboard_shot_001",
      index: 1,
      title: "Hero reveal",
      objective: "Show product identity",
      startSec: 0,
      endSec: 4,
      durationSec: 4,
    },
  ],
};

const shotPrompt = {
  aspectRatio: "9:16",
  shots: [
    {
      id: "shot_prompt_001",
      index: 1,
      title: "Hero reveal",
      objective: "Show product identity",
      startSec: 0,
      endSec: 4,
      visualPrompt: "A crisp product hero shot.",
      referenceAssetRefs: ["product.png"],
      shotImage: {
        subject: "Product centered on a clean tabletop",
        composition: "Three-quarter hero angle",
        lighting: "Soft studio light",
      },
      shotVideo: {
        motion: "Slow push-in",
        continuity: "Keep product centered",
        durationSec: 4,
      },
    },
  ],
};

function shotRow() {
  return {
    id: shotId,
    workspaceId,
    shotSetId,
    orderIndex: 0,
    title: "Hero reveal",
    objective: "Show product identity",
    defaultDurationSec: 4,
    status: "VIDEO_SELECTED",
    nextAction: "READY_FOR_FINAL_COMPOSE",
    activeImagePromptArtifactId: imagePromptId,
    selectedImageId: imageCandidateId,
    activeVideoScriptArtifactId: videoScriptId,
    selectedVideoId: videoCandidateId,
    referenceAssetRefs: ["product.png"],
  };
}

function imagePromptArtifact() {
  return {
    id: imagePromptId,
    shotId,
    version: 1,
    status: "ACTIVE",
    promptText: "A crisp product hero shot.",
    negativePrompt: null,
    referenceAssetIds: ["product.png"],
    promptJson: {
      promptText: "A crisp product hero shot.",
      negativePrompt: null,
      visualStyle: "studio ecommerce",
      composition: "centered",
      lighting: "soft",
      productVisibilityRule: "product remains clear",
      referenceImageUsage: [
        {
          assetId: "product.png",
          usage: "product_identity",
          instruction: "Preserve product identity.",
        },
      ],
      qualityChecklist: ["product visible"],
    },
    sourceFingerprint: {},
    promptAssembly: {},
    baseArtifactId: null,
    createdBy: "agent",
    createdAt: now,
  };
}

function imageCandidate() {
  return {
    id: imageCandidateId,
    imageUrl: "/api/workspaces/workspace_contract_demo/materials/product.png",
    status: "SUCCEEDED",
    errorMessage: null,
  };
}

function imageBatch() {
  return {
    id: imageBatchId,
    batchId: imageBatchId,
    status: "SUCCEEDED",
    requestedCount: 1,
    succeededCount: 1,
    failedCount: 0,
    candidates: [imageCandidate()],
  };
}

function videoScriptArtifact() {
  return {
    id: videoScriptId,
    shotId,
    version: 1,
    status: "ACTIVE",
    durationSec: 4,
    scriptJson: {
      durationSec: 4,
      providerPrompt: "Slow push-in on the product.",
      voiceover: "Meet the compact product.",
    },
    providerPrompt: "Slow push-in on the product.",
    basedOnImageCandidateId: imageCandidateId,
    basedOnPrevImageCandidateId: null,
    basedOnNextImageCandidateId: null,
    createdBy: "agent",
    createdAt: now,
  };
}

function videoCandidate() {
  return {
    id: videoCandidateId,
    videoUrl: "/api/workspaces/workspace_contract_demo/videos/hero.mp4",
    previewVideoUrl: "/api/workspaces/workspace_contract_demo/videos/hero.mp4",
    thumbnailUrl: null,
    durationSec: 4,
    status: "SUCCEEDED",
    providerTaskId: "seedance-task-contract",
    providerReadyAt: now,
    persistStatus: "SUCCEEDED",
    errorMessage: null,
  };
}

function videoBatch() {
  return {
    id: videoBatchId,
    batchId: videoBatchId,
    status: "SUCCEEDED",
    requestedCount: 1,
    succeededCount: 1,
    failedCount: 0,
    candidates: [videoCandidate()],
  };
}

function finalVideoJob() {
  return {
    id: finalVideoJobId,
    workspaceId,
    status: "SUCCEEDED",
    localUrl: "/api/workspaces/workspace_contract_demo/final-videos/final_video_contract_001/file",
    durationSec: 4,
    compiledManifestHash: "sha256:final",
    errorMessage: null,
    createdAt: now,
  };
}

const contracts = [
  {
    id: "config.limits",
    method: "GET",
    path: "/api/config/limits",
    source: ['app.get("/api/config/limits"'],
    mock: () => ({
      data: {
        defaultImageCandidates: 1,
        maxImageCandidatesPerShot: 4,
        defaultVideoCandidates: 1,
        maxVideoCandidatesPerShot: 4,
        aspectRatios: ["9:16", "16:9", "1:1"],
      },
    }),
    validate: (body) => {
      assert.ok(Array.isArray(body.data.aspectRatios));
    },
  },
  {
    id: "pipeline.contracts",
    method: "GET",
    path: "/api/pipeline/contracts",
    source: ['app.get("/api/pipeline/contracts"'],
    mock: () => ({
      contractSet: "v1",
      steps: [{ id: "material_intake" }, { id: "shotprompt" }],
    }),
    validate: (body) => {
      const payload = body.data ?? body;
      assert.ok(payload.contractSet || payload.modules || payload.steps);
    },
  },
  {
    id: "setup-templates.creative-requirements",
    method: "GET",
    path: "/api/setup-templates/creative-requirements",
    source: ['"/api/setup-templates/creative-requirements"'],
    mock: () => ({
      data: {
        templates: creativeRequirementTemplates,
      },
    }),
    validate: (body) => {
      assert.equal(body.data.templates.length, 3);
      assert.equal(body.data.templates[0].id, "real-product-demo");
      assert.equal(typeof body.data.templates[0].values.shotVideoGlobal, "string");
    },
  },
  {
    id: "workspace.list",
    method: "GET",
    path: "/api/workspaces",
    source: ['app.get("/api/workspaces"'],
    mock: () => ({
      workspaces: [workspace()],
      discovered: [{ localPath: "/tmp/discovered", workspaceId: null }],
    }),
    validate: (body) => {
      assert.ok(Array.isArray(body.workspaces));
      assert.ok(Array.isArray(body.discovered));
    },
  },
  {
    id: "workspace.create",
    method: "POST",
    path: "/api/workspaces",
    source: ['app.post("/api/workspaces"'],
    body: { name: "Contract Demo" },
    mock: () => ({ workspace: workspace(), manifest: manifest(), storage: null }),
    validate: validateWorkspaceInitialize,
  },
  {
    id: "workspace.directory.select",
    method: "POST",
    path: "/api/workspaces/directory/select",
    source: ['app.post("/api/workspaces/directory/select"'],
    body: {},
    mock: () => ({
      directory: "/tmp/aigc-contract-workspace",
      cancelled: false,
      method: "macos",
    }),
    validate: (body) => {
      assert.equal(typeof body.cancelled, "boolean");
      assert.ok(["macos", "windows", "linux", "unsupported"].includes(body.method));
    },
  },
  {
    id: "workspace.init",
    method: "POST",
    path: "/api/workspaces/init",
    source: ['app.post("/api/workspaces/init"'],
    body: { directory: "/tmp/aigc-contract-workspace" },
    mock: () => ({ workspace: workspace(), manifest: manifest(), storage: null }),
    validate: validateWorkspaceInitialize,
  },
  {
    id: "workspace.status",
    method: "GET",
    path: "/api/workspaces/:workspaceId/status",
    source: ['workspaceRoute("/status")'],
    mock: () => ({
      workspace: workspace(),
      manifest: manifest(),
      nextAction: { stage: "video", method: "POST" },
      materialLibrary: materialIntake,
      modules: {
        "prompt-requirements": {
          moduleId: "prompt-requirements",
          proposed: null,
          current: moduleArtifact("prompt-requirements", promptRequirements),
          upstream: { upstreamChanged: false, changedSources: [] },
        },
        "material-intake": {
          moduleId: "material-intake",
          proposed: null,
          current: moduleArtifact("material-intake", materialIntake),
          upstream: { upstreamChanged: false, changedSources: [] },
        },
      },
      activeShotSet: {
        id: shotSetId,
        workspaceId,
        shotPromptArtifactId: "shotprompt_artifact_contract",
        status: "active",
        sourceFingerprint: {},
        createdAt: now,
        archivedAt: null,
      },
      artifacts: {
        promptRequirements: moduleArtifact("prompt-requirements", promptRequirements),
        material: moduleArtifact("material-intake", materialIntake),
        brief: moduleArtifact("product-brief", productBrief),
        storyboard: moduleArtifact("storyboard", storyboard),
        shotPrompt: moduleArtifact("shotprompt", shotPrompt),
      },
    }),
    validate: (body) => {
      assert.equal(body.workspace.id, workspaceId);
      assert.ok(body.materialLibrary.assets[0].tags.includes("product"));
      assert.equal(body.artifacts.material.moduleId, "material-intake");
    },
  },
  ...moduleContracts("prompt-requirements", promptRequirements),
  {
    id: "reference-video.import",
    method: "POST",
    path: "/api/workspaces/:workspaceId/reference-video/import",
    source: ["/reference-video/import"],
    body: { source: { type: "url", url: "https://example.com/reference.mp4" } },
    mock: () => ({
      data: {
        source: {
          type: "url",
          url: "https://example.com/reference.mp4",
          downloaded: true,
          contentType: "video/mp4",
          sizeBytes: 1024,
        },
        draft: promptRequirements,
        analysis: {
          summary: "Reference uses a concise proof rhythm.",
          confidence: "medium",
          detectedBeats: ["hook", "proof", "cta"],
          risks: [],
        },
      },
    }),
    validate: (body) => {
      assert.equal(body.data.source.type, "url");
      assert.equal(body.data.analysis.confidence, "medium");
    },
  },
  ...moduleContracts("material-intake", materialIntake),
  ...moduleContracts("product-brief", productBrief),
  ...moduleContracts("storyboard", storyboard),
  ...moduleContracts("shotprompt", shotPrompt),
  {
    id: "shot-set.apply",
    method: "POST",
    path: "/api/workspaces/:workspaceId/shot-sets",
    source: ['workspaceRoute("/shot-sets")'],
    body: { shotPromptArtifactId: "shotprompt_artifact_contract" },
    mock: () => ({
      data: {
        id: shotSetId,
        workspaceId,
        shotPromptArtifactId: "shotprompt_artifact_contract",
        status: "active",
        sourceFingerprint: {},
        createdAt: now,
        archivedAt: null,
      },
    }),
    validate: (body) => assert.equal(body.data.status, "active"),
  },
  {
    id: "shot-set.list",
    method: "GET",
    path: "/api/workspaces/:workspaceId/shot-sets",
    source: ['workspaceRoute("/shot-sets")'],
    mock: () => ({ data: [{ id: shotSetId, status: "active" }] }),
    validate: (body) => assert.equal(body.data[0].status, "active"),
  },
  {
    id: "shots.list",
    method: "GET",
    path: "/api/workspaces/:workspaceId/shots",
    source: ['"/api/workspaces/:workspaceId/shots"'],
    mock: () => ({ data: [shotRow()] }),
    validate: validateShotList,
  },
  {
    id: "shots.get",
    method: "GET",
    path: "/api/shots/:shotId",
    source: ['"/api/shots/:shotId"'],
    mock: () => ({ data: shotRow() }),
    validate: (body) => assert.equal(body.data.id, shotId),
  },
  {
    id: "shot.asset-refs.list",
    method: "GET",
    path: "/api/shots/:shotId/asset-refs",
    source: ['"/api/shots/:shotId/asset-refs"'],
    mock: () => ({
      data: [
        {
          id: "shot_asset_ref_contract_001",
          shotId,
          assetId: "product.png",
          role: "product_identity",
          weight: 1,
          position: 0,
          ref: "product.png",
          url: "/api/workspaces/workspace_contract_demo/materials/product.png",
        },
      ],
    }),
    validate: (body) => {
      assert.equal(body.data[0].shotId, shotId);
      assert.equal(body.data[0].role, "product_identity");
    },
  },
  {
    id: "shot.asset-refs.patch",
    method: "PATCH",
    path: "/api/shots/:shotId/asset-refs",
    source: ['"/api/shots/:shotId/asset-refs"'],
    body: { refs: [{ assetId: "product.png", role: "product_identity", weight: 1 }] },
    mock: () => ({
      data: [
        {
          id: "shot_asset_ref_contract_001",
          shotId,
          assetId: "product.png",
          role: "product_identity",
          weight: 1,
          position: 0,
        },
      ],
    }),
    validate: (body) => assert.equal(body.data[0].assetId, "product.png"),
  },
  {
    id: "shot.workflow-status",
    method: "GET",
    path: "/api/workspaces/:workspaceId/shot-workflow-status",
    source: ['"/api/workspaces/:workspaceId/shot-workflow-status"'],
    mock: () => ({
      data: {
        workspaceId,
        canComposeFinalVideo: true,
        shots: [
          {
            shotId,
            orderIndex: 0,
            status: "VIDEO_SELECTED",
            nextAction: "READY_FOR_FINAL_COMPOSE",
            activeImagePromptArtifactId: imagePromptId,
            selectedImageId: imageCandidateId,
            selectedImageUrl: imageCandidate().imageUrl,
            activeVideoScriptArtifactId: videoScriptId,
            selectedVideoId: videoCandidateId,
            activeImageBatchId: imageBatchId,
            activeVideoBatchId: videoBatchId,
            activeVideoBatchStatus: "SUCCEEDED",
            upstream: { upstreamChanged: false, changedSources: [] },
            videoUpstream: { upstreamChanged: false, changedSources: [] },
          },
        ],
      },
    }),
    validate: (body) => {
      assert.equal(body.data.workspaceId, workspaceId);
      assert.equal(body.data.shots[0].selectedImageUrl, imageCandidate().imageUrl);
    },
  },
  {
    id: "image-prompt.propose",
    method: "POST",
    path: "/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose",
    source: ["/image-prompts/propose"],
    body: { userDirection: "keep product crisp" },
    mock: () => ({
      data: imagePromptArtifact(),
      artifact: imagePromptArtifact(),
      batch: imageBatch(),
      candidates: [imageCandidate()],
      shotStatus: "IMAGE_GENERATING",
      nextAction: "POLL_IMAGE_BATCH",
      context: { referenceAssetRefs: ["product.png"] },
    }),
    validate: (body) => {
      assert.equal(body.artifact.id, imagePromptId);
      assert.ok(Array.isArray(body.candidates));
    },
  },
  {
    id: "image-prompt.regenerate",
    method: "POST",
    path: "/api/workspaces/:workspaceId/shots/:shotId/image-prompts/regenerate",
    source: ["/image-prompts/regenerate"],
    body: { baseArtifactId: imagePromptId, userDirection: "make the entrance sign clearer" },
    mock: () => ({
      data: { ...imagePromptArtifact(), id: "image_prompt_contract_002", createdBy: "user" },
      artifact: { ...imagePromptArtifact(), id: "image_prompt_contract_002", createdBy: "user" },
      batch: imageBatch(),
      candidates: [imageCandidate()],
      shotStatus: "IMAGE_GENERATING",
      nextAction: "POLL_IMAGE_BATCH",
      context: {},
    }),
    validate: (body) => assert.equal(body.artifact.createdBy, "user"),
  },
  {
    id: "image-prompts.list",
    method: "GET",
    path: "/api/shots/:shotId/image-prompts",
    source: ['"/api/shots/:shotId/image-prompts"'],
    mock: () => ({ data: [imagePromptArtifact()] }),
    validate: (body) => assert.equal(body.data[0].id, imagePromptId),
  },
  {
    id: "image-rounds.list",
    method: "GET",
    path: "/api/workspaces/:workspaceId/shots/:shotId/image-rounds",
    source: ["/image-rounds"],
    mock: () => ({
      data: [
        {
          artifact: imagePromptArtifact(),
          batch: { ...imageBatch(), workspaceId, shotId },
          candidates: [imageCandidate()],
          selection: {
            shotId,
            selectedCandidateId: imageCandidateId,
            selectedImageUrl: imageCandidate().imageUrl,
            nextShotId: null,
            allShotsImageSelected: true,
          },
          upstream: { upstreamChanged: false, changedSources: [] },
          context: {},
        },
      ],
    }),
    validate: (body) => assert.equal(body.data[0].selection.selectedCandidateId, imageCandidateId),
  },
  {
    id: "image.select",
    method: "POST",
    path: "/api/workspaces/:workspaceId/shots/:shotId/image-candidates/select",
    source: ["/image-candidates/select"],
    body: { imageCandidateId, imageGenerationBatchId: imageBatchId },
    mock: () => ({ data: { selectedImageId: imageCandidateId }, shotStatus: "IMAGE_SELECTED" }),
    validate: (body) => assert.equal(body.data.selectedImageId, imageCandidateId),
  },
  {
    id: "video-script.propose",
    method: "POST",
    path: "/api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose",
    source: ["/video-scripts/propose"],
    body: { userDirection: "smooth push-in" },
    mock: () => ({
      data: videoScriptArtifact(),
      artifact: videoScriptArtifact(),
      batch: videoBatch(),
      candidates: [videoCandidate()],
      shotStatus: "VIDEO_GENERATING",
      nextAction: "POLL_VIDEO_BATCH",
      context: {},
      frames: {
        firstFrameCandidateId: imageCandidateId,
        lastFrameCandidateId: null,
        firstFrameUrl: imageCandidate().imageUrl,
        lastFrameUrl: null,
      },
    }),
    validate: (body) => assert.equal(body.artifact.id, videoScriptId),
  },
  {
    id: "video-scripts.list",
    method: "GET",
    path: "/api/shots/:shotId/video-scripts",
    source: ['"/api/shots/:shotId/video-scripts"'],
    mock: () => ({ data: [videoScriptArtifact()] }),
    validate: (body) => assert.equal(body.data[0].id, videoScriptId),
  },
  {
    id: "video-rounds.list",
    method: "GET",
    path: "/api/workspaces/:workspaceId/shots/:shotId/video-rounds",
    source: ["/video-rounds"],
    mock: () => ({
      data: [
        {
          artifact: videoScriptArtifact(),
          batch: { ...videoBatch(), workspaceId, shotId },
          candidates: [videoCandidate()],
          selection: {
            shotId,
            selectedCandidateId: videoCandidateId,
            selectedVideoUrl: videoCandidate().videoUrl,
            duration: 4,
            allShotsVideoSelected: true,
          },
          frames: {
            firstFrameUrl: imageCandidate().imageUrl,
            lastFrameUrl: null,
            firstFrameCandidateId: imageCandidateId,
            lastFrameCandidateId: null,
          },
          upstream: { upstreamChanged: false, changedSources: [] },
          context: {},
        },
      ],
    }),
    validate: (body) => assert.equal(body.data[0].selection.selectedCandidateId, videoCandidateId),
  },
  {
    id: "video.select",
    method: "POST",
    path: "/api/workspaces/:workspaceId/shots/:shotId/video-candidates/select",
    source: ["/video-candidates/select"],
    body: { videoCandidateId, videoGenerationBatchId: videoBatchId },
    mock: () => ({ data: { selectedVideoId: videoCandidateId }, shotStatus: "VIDEO_SELECTED" }),
    validate: (body) => assert.equal(body.data.selectedVideoId, videoCandidateId),
  },
  {
    id: "shot.retry",
    method: "POST",
    path: "/api/shots/:shotId/retry",
    source: ['"/api/shots/:shotId/retry"'],
    headers: { "Idempotency-Key": "contract-retry-key" },
    body: { what: "image_batch" },
    mock: () => ({ data: { retried: true }, shotStatus: "IMAGE_GENERATING" }),
    validate: (body) => assert.equal(body.data.retried, true),
  },
  {
    id: "final-video.create",
    method: "POST",
    path: "/api/workspaces/:workspaceId/final-videos",
    source: ['"/api/workspaces/:workspaceId/final-videos"'],
    headers: { "Idempotency-Key": "contract-final-key" },
    body: { outputAspectRatio: "9:16" },
    mock: () => ({
      data: {
        finalVideoJobId,
        jobId: finalVideoJobId,
        status: "PENDING",
      },
    }),
    validate: (body) => assert.equal(body.data.finalVideoJobId, finalVideoJobId),
  },
  {
    id: "final-video.get",
    method: "GET",
    path: "/api/final-videos/:finalVideoJobId",
    source: ['"/api/final-videos/:finalVideoJobId"'],
    mock: () => ({ data: finalVideoJob() }),
    validate: (body) => assert.equal(body.data.id, finalVideoJobId),
  },
  {
    id: "traces.workspace",
    method: "GET",
    path: "/api/workspaces/:workspaceId/traces",
    source: ['"/api/workspaces/:workspaceId/traces"'],
    query: "limit=12",
    mock: () => ({
      data: [
        {
          id: "trace_contract_001",
          workspaceId,
          shotId: null,
          traceType: "agent_run",
          name: "material_intake.request_prepared",
          inputPreview: null,
          outputPreview: null,
          metadata: {},
          createdAt: now,
        },
      ],
    }),
    validate: (body) => assert.equal(body.data[0].traceType, "agent_run"),
  },
  {
    id: "traces.shot",
    method: "GET",
    path: "/api/shots/:shotId/traces",
    source: ['"/api/shots/:shotId/traces"'],
    query: "limit=12",
    mock: () => ({ data: [] }),
    validate: (body) => assert.ok(Array.isArray(body.data)),
  },
];

function moduleContracts(moduleId, data) {
  return [
    {
      id: `${moduleId}.get`,
      method: "GET",
      path: `/api/workspaces/:workspaceId/${moduleId}`,
      source: [`workspaceRoute("/${moduleId}")`],
      mock: () => ({
        data: {
          moduleId,
          proposed: null,
          current: moduleArtifact(moduleId, data),
          upstream: { upstreamChanged: false, changedSources: [] },
        },
      }),
      validate: (body) => {
        assert.equal(body.data.moduleId, moduleId);
        assert.equal(body.data.current.moduleId, moduleId);
      },
    },
    {
      id: `${moduleId}.propose`,
      method: "POST",
      path: `/api/workspaces/:workspaceId/${moduleId}/propose`,
      source: [`workspaceRoute("/${moduleId}/propose")`],
      body: moduleId === "prompt-requirements" ? { data } : { userDirection: "contract check" },
      mock: () => ({ data: moduleArtifact(moduleId, data, "proposed") }),
      validate: (body) => validateModuleArtifact(body, moduleId, "proposed"),
    },
    {
      id: `${moduleId}.approve`,
      method: "POST",
      path: `/api/workspaces/:workspaceId/${moduleId}/approve`,
      source: [`workspaceRoute("/${moduleId}/approve")`],
      body: { data },
      mock: () => ({ data: moduleArtifact(moduleId, data) }),
      validate: (body) => validateModuleArtifact(body, moduleId, "approved"),
    },
  ];
}

function validateWorkspaceInitialize(body) {
  assert.equal(body.workspace.id, workspaceId);
  assert.equal(body.manifest.workspaceId, workspaceId);
}

function validateModuleArtifact(body, moduleId, status) {
  assert.equal(body.data.moduleId, moduleId);
  assert.equal(body.data.status, status);
  assert.equal(typeof body.data.isCurrent, "boolean");
}

function validateShotList(body) {
  assert.ok(Array.isArray(body.data));
  assert.equal(body.data[0].id, shotId);
  assert.equal(body.data[0].nextAction, "READY_FOR_FINAL_COMPOSE");
}

function renderPath(template) {
  return template
    .replaceAll(":workspaceId", workspaceId)
    .replaceAll(":shotSetId", shotSetId)
    .replaceAll(":shotId", shotId)
    .replaceAll(":finalVideoJobId", finalVideoJobId);
}

function toOpenApiPath(template) {
  return template
    .replaceAll(":workspaceId", "{workspaceId}")
    .replaceAll(":shotSetId", "{shotSetId}")
    .replaceAll(":shotId", "{shotId}")
    .replaceAll(":finalVideoJobId", "{finalVideoJobId}")
    .replaceAll(":ref", "{wildcard}");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openApiHasMethod(openapi, openApiPath, method) {
  const blockPattern = new RegExp(
    `^  ${escapeRegExp(openApiPath)}:\\n([\\s\\S]*?)(?=^  /api/|\\Z)`,
    "m",
  );
  const block = blockPattern.exec(openapi)?.[1] ?? "";
  return new RegExp(`^    ${method.toLowerCase()}:`, "m").test(block);
}

function routeRegex(template) {
  const pattern = template
    .split("/")
    .map((segment) => {
      if (!segment) return "";
      if (segment.startsWith(":")) return "[^/]+";
      return escapeRegExp(segment);
    })
    .join("/");
  return new RegExp(`^${pattern}$`);
}

async function startMockServer() {
  const routes = contracts.map((contract) => ({
    ...contract,
    regex: routeRegex(renderPath(contract.path)),
  }));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://contract.mock");
    const route = routes.find(
      (candidate) =>
        candidate.method === req.method && candidate.regex.test(url.pathname),
    );
    if (!route) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: "NOT_FOUND", message: "No mock route" }));
      return;
    }

    for await (const _chunk of req) {
      // Drain body so clients can finish writes.
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(route.mock()));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function requestContract(baseUrl, contract) {
  const url = new URL(renderPath(contract.path), baseUrl);
  if (contract.query) url.search = contract.query;
  const headers = {
    Accept: "application/json",
    ...(contract.body ? { "Content-Type": "application/json" } : {}),
    ...(contract.headers ?? {}),
  };
  const response = await fetch(url, {
    method: contract.method,
    headers,
    body: contract.body ? JSON.stringify(contract.body) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  assert.equal(
    response.ok,
    true,
    `${contract.id} expected 2xx from ${contract.method} ${url}; got ${response.status} ${text}`,
  );
  contract.validate(body);
}

async function runContracts(baseUrl, selectedContracts = contracts) {
  for (const contract of selectedContracts) {
    await requestContract(baseUrl, contract);
  }
}

async function readServerSource() {
  const serverDir = path.join(rootDir, "apps/server/src");
  const chunks = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        chunks.push(await readFile(fullPath, "utf8"));
      }
    }
  }
  await walk(serverDir);
  return chunks.join("\n");
}

function findMissingServerRoutes(source) {
  return contracts.filter(
    (contract) =>
      contract.source?.length &&
      !contract.source.some((needle) => source.includes(needle)),
  );
}

async function writeBackendGapIssue(missing) {
  const issueDir = path.join(rootDir, "docs/issues/P0/backend");
  await mkdir(issueDir, { recursive: true });
  const issuePath = path.join(issueDir, "shot-asset-refs-api-2026-06-02.md");
  const assetRefMissing = missing.filter((item) => item.id.startsWith("shot.asset-refs"));
  if (assetRefMissing.length === 0) return null;

  const content = `# P0 Backend Gap: Shot asset refs API

Date: 2026-06-02

## Problem

The latest frontend exposes editable shot material references through \`GET /api/shots/:shotId/asset-refs\` and \`PATCH /api/shots/:shotId/asset-refs\`, but the server does not currently register public routes for those endpoints. The UI can hide the missing GET behind an empty fallback, but PATCH fails when a user edits references.

## Required contract

- \`GET /api/shots/:shotId/asset-refs\`
  - Returns \`{ data: ShotAssetRef[] }\`.
  - Each item includes \`id\`, \`shotId\`, \`assetId\`, \`role\`, \`weight\`, \`position\`, and should include \`ref\` / \`url\` when the asset comes from workspace materials.
- \`PATCH /api/shots/:shotId/asset-refs\`
  - Body: \`{ refs: [{ assetId, role, weight? }] }\`.
  - Replaces the editable reference list for the active shot, preserving body order as \`position\`.
  - Validates the shot belongs to the active shot set and every asset belongs to the same workspace material library or an existing asset.
  - Returns the updated \`{ data: ShotAssetRef[] }\`.

## Role enum

\`product_identity | reference_style | reference_scene | first_frame_hint | other\`

Existing shot-set apply may keep legacy \`reference\` rows, but the edit API should normalize future user edits to the enum above.

## Mock fallback

\`scripts/frontend-backend-contract-check.mjs\` supplies an in-process mock for both routes so frontend shape tests can continue while the backend route is pending.

## Acceptance

- The endpoints are implemented in the shot controller/service.
- \`docs/core/openapi.yaml\`, \`docs/core/interface.md\`, and \`docs/test/postman-test-plan.md\` remain aligned.
- A Postman/Newman P0 case covers GET, PATCH add, PATCH remove, invalid shot, invalid asset, and archived shot behavior.
`;
  await writeFile(issuePath, content, "utf8");
  return issuePath;
}

test("docs/core/openapi.yaml covers the frontend API surface", async () => {
  const openapi = await readFile(path.join(rootDir, "docs/core/openapi.yaml"), "utf8");
  const missing = contracts.filter(
    (contract) =>
      !openApiHasMethod(
        openapi,
        contract.openapiPath ?? toOpenApiPath(contract.path),
        contract.method,
      ),
  );
  assert.deepEqual(
    missing.map((contract) => `${contract.method} ${contract.openapiPath ?? toOpenApiPath(contract.path)}`),
    [],
  );
});

test("mock backend satisfies the frontend contract shapes", async () => {
  const mock = await startMockServer();
  try {
    await runContracts(mock.baseUrl);
  } finally {
    await mock.close();
  }
});

test("server source exposes frontend routes or records backend gaps", async (t) => {
  const source = await readServerSource();
  const missing = findMissingServerRoutes(source);
  if (missing.length > 0) {
    t.diagnostic(
      `Missing server routes: ${missing.map((item) => `${item.method} ${item.path}`).join(", ")}`,
    );
    if (writeIssues) {
      const issuePath = await writeBackendGapIssue(missing);
      if (issuePath) t.diagnostic(`Wrote backend issue: ${issuePath}`);
    }
  }
  if (strictSource) {
    assert.deepEqual(
      missing.map((contract) => `${contract.method} ${contract.path}`),
      [],
    );
  }
});

if (runLive) {
  test("live backend satisfies non-mutating frontend probes", async () => {
    const liveContracts = contracts.filter((contract) =>
      [
        "config.limits",
        "pipeline.contracts",
        "workspace.list",
      ].includes(contract.id),
    );
    await runContracts(liveBaseUrl, liveContracts);
  });
}
