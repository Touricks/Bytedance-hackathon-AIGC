import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  buildMaterialIntakePromptView,
  buildProductBriefPromptView,
  buildShotPromptPromptView,
  buildStoryboardPromptView,
  createFileTraceLogger,
  generateMaterialIntakeWithArk,
  generateProductBriefWithArk,
  generateShotPromptWithArk,
  generateStoryboardWithArk,
  getPipelineContractStep,
} from "@aigc-video/ai";
import {
  compileShotPrompt as compileShotPromptArtifact,
  feedbackRouteArtifactSchema,
  materialIntakeArtifactSchema,
  productBriefArtifactSchema,
  shotPromptArtifactSchema,
  storyboardArtifactSchema,
  type MaterialAsset,
  type MaterialIntakeArtifact,
  type ProductBriefArtifact,
  type ShotPromptArtifact,
  type StoryboardArtifact,
  type GeneratedScript,
  type CreativeWorkspace,
} from "@aigc-video/shared";
import { assertValidRasterImageBytes } from "../../common/image-validation.js";
import { config } from "../../common/config.js";
import { NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { enqueueGenerationJob } from "../../jobs/queue.js";
import {
  workspaceManifestSchema,
  type WorkspaceDirectoryRequest,
  type WorkspaceManifest,
} from "./workspace.schema.js";

const workspaceManifestRelativePath = path.join(".daireel", "workspace.json");
const workspaceTraceFile = ".daireel/trace/events.jsonl" as const;
const workspaceMaterialsRelativePath = path.join(".daireel", "materials");
export const maxWorkspaceMaterialBytes = 50 * 1024 * 1024;

const mimeByExtension: Record<string, string> = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".md": "text/markdown",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function normalizeWorkspacePath(directory: string) {
  return path.resolve(directory);
}

function workspaceMaterialsPath(directory: string) {
  return path.join(directory, workspaceMaterialsRelativePath);
}

function isInsideDirectory(filePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, filePath);
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function managedWorkspaceName(input?: string) {
  const normalized =
    input
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace";
  return normalized || "workspace";
}

function safeWorkspaceFilename(filename: string) {
  const baseName = path.basename(filename);
  if (baseName !== filename || baseName === "." || baseName === "..") {
    throw new Error("Workspace material filename must not include a path");
  }
  if (baseName.startsWith(".")) {
    throw new Error("Workspace material filename must not be hidden");
  }
  return baseName;
}

function workspaceMaterialMime(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  const mime = mimeByExtension[ext];
  if (!mime) {
    throw new Error("Unsupported material type");
  }
  return mime;
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function uniqueWorkspaceMaterialFilename(
  directory: string,
  filename: string,
) {
  const ext = path.extname(filename);
  const name = filename.slice(0, filename.length - ext.length);
  let candidate = filename;
  let index = 1;

  while (await fileExists(path.join(directory, candidate))) {
    candidate = `${name}-${index}${ext}`;
    index += 1;
  }

  return candidate;
}

function manifestPath(directory: string) {
  return path.join(directory, workspaceManifestRelativePath);
}

function toManifest(input: {
  workspaceId: string;
  currentScriptId: string;
  currentJobId?: string;
}): WorkspaceManifest {
  return {
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    currentScriptId: input.currentScriptId,
    currentJobId: input.currentJobId,
    traceFile: workspaceTraceFile,
  };
}

async function writeManifest(directory: string, manifest: WorkspaceManifest) {
  await mkdir(path.dirname(manifestPath(directory)), { recursive: true });
  await writeFile(
    manifestPath(directory),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function readManifest(directory: string) {
  const raw = await readFile(manifestPath(directory), "utf8");
  return workspaceManifestSchema.parse(JSON.parse(raw));
}

async function resolveWorkspaceLocalPath(
  target: string | WorkspaceDirectoryRequest,
) {
  if (typeof target === "string") {
    return normalizeWorkspacePath(target);
  }

  if (target.workspaceId) {
    const workspace = await db.getWorkspace(target.workspaceId);
    const localPath = normalizeWorkspacePath(workspace.localPath);
    const manifest = await readManifest(localPath);
    if (manifest.workspaceId !== workspace.id) {
      throw new Error(
        "Workspace manifest does not match requested workspaceId",
      );
    }
    if (manifest.currentScriptId !== workspace.currentScriptId) {
      throw new Error("Workspace manifest does not match requested scriptId");
    }
    return localPath;
  }

  if (target.directory) {
    return normalizeWorkspacePath(target.directory);
  }

  throw new Error("workspaceId or directory is required");
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function classifyKind(mime: string): MaterialAsset["kind"] {
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  return "text";
}

function defaultRole(kind: MaterialAsset["kind"], hasPrimaryImage: boolean) {
  if (kind === "image") {
    return hasPrimaryImage ? "reference" : "product_main";
  }
  if (kind === "video") {
    return "demo_video";
  }
  return "spec_text";
}

function firstSellingPoint(input: string) {
  return (
    input
      .split(/[,\n，]/)
      .map((value) => value.trim())
      .find(Boolean) ?? input.trim()
  );
}

function inferProductName(input: {
  title?: string;
  userDirection?: string;
  material: MaterialIntakeArtifact;
}) {
  return (
    input.title?.trim() ||
    input.material.assets.find(
      (asset) => asset.ref === input.material.primaryProductRef,
    )?.description ||
    input.userDirection?.trim().slice(0, 48) ||
    "Imported product"
  );
}

function inferSellingPoint(input: {
  sellingPoints?: string;
  userDirection?: string;
  material: MaterialIntakeArtifact;
}) {
  return (
    firstSellingPoint(input.sellingPoints ?? "") ||
    input.material.assets.find((asset) => asset.included)?.description ||
    input.userDirection?.trim() ||
    "Product benefit inferred from selected materials"
  );
}

function toProductBrief(input: {
  userDirection?: string;
  title?: string;
  sellingPoints?: string;
  audience?: string;
  stylePreference?: string;
  material: MaterialIntakeArtifact;
}): ProductBriefArtifact {
  const sellingPoint = inferSellingPoint(input);
  const productName = inferProductName(input);
  const audience = input.audience?.trim() || "target ecommerce shoppers";
  const productAssets = input.material.assets
    .filter((asset) => asset.included && asset.kind === "image")
    .map((asset) => ({
      ref: asset.ref,
      useAs:
        asset.ref === input.material.primaryProductRef ? "primary" : "support",
    }));

  return productBriefArtifactSchema.parse({
    product: {
      name: productName,
      category: "consumer product",
      keyFacts: (input.sellingPoints ?? sellingPoint)
        .split(/[,\n，]/)
        .map((value) => value.trim())
        .filter(Boolean),
      assets: productAssets,
    },
    audience: {
      who: audience,
      painOrDesire: `Needs ${sellingPoint}`,
    },
    coreSellingPoint: sellingPoint,
    proof: input.material.assets
      .filter((asset) => asset.included)
      .map((asset) => asset.description),
    offer: null,
    platform: "Seedance",
    brandTone: input.stylePreference ?? "clear ecommerce",
    bannedExpressions: [],
    landingInfo: null,
    assumptions: ["Generated from approved material intake."],
  });
}

const productBriefForm = {
  artifactType: "brief",
  artifactSchemaVersion: "product-brief.v1",
  fields: [
    {
      path: "product.name",
      label: "商品名称",
      component: "text",
      required: true,
    },
    {
      path: "product.category",
      label: "商品类目",
      component: "text",
      required: true,
    },
    {
      path: "product.keyFacts",
      label: "关键事实",
      component: "string_list",
      required: true,
    },
    {
      path: "product.assets",
      label: "产品素材",
      component: "asset_ref_list",
      source: "material.assets",
      required: true,
    },
    {
      path: "audience.who",
      label: "目标人群",
      component: "text",
      required: true,
    },
    {
      path: "audience.painOrDesire",
      label: "痛点/欲望",
      component: "textarea",
      required: true,
    },
    {
      path: "coreSellingPoint",
      label: "核心卖点",
      component: "textarea",
      required: true,
    },
    {
      path: "proof",
      label: "证明点",
      component: "string_list",
      required: true,
    },
    { path: "offer", label: "优惠信息", component: "nullable_text" },
    { path: "platform", label: "平台", component: "text", required: true },
    { path: "brandTone", label: "品牌语气", component: "text", required: true },
    {
      path: "bannedExpressions",
      label: "禁用表达",
      component: "string_list",
    },
    { path: "landingInfo", label: "落地页信息", component: "nullable_text" },
    { path: "assumptions", label: "假设", component: "string_list" },
  ],
};

function primaryBriefAsset(brief: ProductBriefArtifact) {
  return (
    brief.product.assets.find((asset) => asset.useAs === "primary")?.ref ??
    brief.product.assets[0]?.ref ??
    "product"
  );
}

function toStoryboard(brief: ProductBriefArtifact): StoryboardArtifact {
  const productAssetRef = primaryBriefAsset(brief);
  const proof = brief.proof[0] ?? brief.coreSellingPoint;

  return storyboardArtifactSchema.parse({
    narrative: `${brief.product.name} helps ${brief.audience.who} with ${brief.coreSellingPoint}.`,
    totalDurationSec: 12,
    shots: [
      {
        index: 0,
        purpose: "hook",
        durationSec: 3,
        scene: `${brief.product.name} hero problem hook`,
        visualDirection: `Show ${productAssetRef} as the primary product asset with ${brief.brandTone} styling.`,
        productAssetRef,
        voiceover: `Meet ${brief.product.name}.`,
        transition: "cut",
      },
      {
        index: 1,
        purpose: "benefit",
        durationSec: 3,
        scene: `${brief.coreSellingPoint} benefit demonstration`,
        visualDirection: `Use ${productAssetRef} in a realistic moment for ${brief.audience.who}.`,
        productAssetRef,
        voiceover: `${brief.coreSellingPoint}.`,
        transition: "match cut",
      },
      {
        index: 2,
        purpose: "proof",
        durationSec: 3,
        scene: "Proof and product detail",
        visualDirection: `Show a close detail of ${productAssetRef} that supports: ${proof}.`,
        productAssetRef,
        voiceover: proof,
        transition: "push",
      },
      {
        index: 3,
        purpose: "cta",
        durationSec: 3,
        scene: "Clear purchase call to action",
        visualDirection: `End on ${productAssetRef} with a confident ecommerce packshot.`,
        productAssetRef,
        voiceover: `Try ${brief.product.name} today.`,
        transition: "fade",
      },
    ],
    assumptions: ["Storyboard generated from approved product brief."],
  });
}

const storyboardForm = {
  artifactType: "storyboard",
  artifactSchemaVersion: "ugc-storyboard.v1",
  fields: [
    {
      path: "narrative",
      label: "叙事主线",
      component: "textarea",
      required: true,
    },
    {
      path: "totalDurationSec",
      label: "总时长",
      component: "number",
      required: true,
    },
    {
      path: "shots[].purpose",
      label: "镜头目的",
      component: "select",
      options: ["hook", "benefit", "proof", "cta"],
      required: true,
    },
    {
      path: "shots[].durationSec",
      label: "镜头时长",
      component: "number",
      required: true,
    },
    {
      path: "shots[].scene",
      label: "场景",
      component: "textarea",
      required: true,
    },
    {
      path: "shots[].visualDirection",
      label: "画面方向",
      component: "textarea",
      required: true,
    },
    {
      path: "shots[].productAssetRef",
      label: "素材引用",
      component: "asset_ref_select",
      source: "material.assets",
      required: true,
    },
    {
      path: "shots[].voiceover",
      label: "旁白",
      component: "textarea",
      required: true,
    },
    {
      path: "shots[].transition",
      label: "转场",
      component: "text",
      required: true,
    },
    { path: "assumptions", label: "假设", component: "string_list" },
  ],
};

const shotPromptForm = {
  artifactType: "shotprompt",
  artifactSchemaVersion: "video-shotprompt.v1",
  fields: [
    {
      path: "prompt",
      label: "Seedance 总 Prompt",
      component: "textarea",
      required: true,
    },
    { path: "negativePrompt", label: "负向 Prompt", component: "textarea" },
    {
      path: "shots[].providerPrompt",
      label: "镜头 Prompt",
      component: "textarea",
      required: true,
    },
    {
      path: "shots[].referenceAssetRefs",
      label: "参考素材",
      component: "asset_ref_list",
      source: "material.assets",
      required: true,
    },
    {
      path: "shots[].voiceover",
      label: "旁白源",
      component: "textarea",
      required: true,
    },
    { path: "tts.enabled", label: "启用 TTS", component: "checkbox" },
    {
      path: "tts.voiceover",
      label: "TTS 预览",
      component: "textarea",
      source: "shots.voiceover",
      readOnly: true,
    },
    { path: "assumptions", label: "假设", component: "string_list" },
  ],
};

function createWorkspaceTraceLogger(
  localPath: string,
  workspace: CreativeWorkspace,
) {
  return createFileTraceLogger({
    traceId: workspace.currentScriptId,
    workspaceId: workspace.id,
    traceFilePath: path.join(localPath, workspaceTraceFile),
  });
}

async function productBriefImageInput(
  localPath: string,
  material: MaterialIntakeArtifact,
) {
  const primaryImage =
    material.assets.find(
      (asset) =>
        asset.ref === material.primaryProductRef && asset.kind === "image",
    ) ??
    material.assets.find((asset) => asset.kind === "image" && asset.included);
  if (!primaryImage) {
    return undefined;
  }

  const bytes = await readFile(
    path.join(workspaceMaterialsPath(localPath), primaryImage.ref),
  );
  return {
    url: `data:${primaryImage.mime};base64,${bytes.toString("base64")}`,
    mode: "data_url" as const,
    detail: "high" as const,
  };
}

async function materialIntakeImageInputs(
  localPath: string,
  material: MaterialIntakeArtifact,
) {
  const imageAssets = material.assets.filter(
    (asset) => asset.kind === "image" && asset.included,
  );

  return Promise.all(
    imageAssets.map(async (asset) => {
      const bytes = await readFile(
        path.join(workspaceMaterialsPath(localPath), asset.ref),
      );
      return {
        ref: asset.ref,
        url: `data:${asset.mime};base64,${bytes.toString("base64")}`,
        mode: "data_url" as const,
        detail: "high" as const,
      };
    }),
  );
}

async function materialIntakeTextPreviews(
  localPath: string,
  material: MaterialIntakeArtifact,
) {
  const textAssets = material.assets.filter(
    (asset) => asset.kind === "text" && asset.included,
  );

  return Promise.all(
    textAssets.map(async (asset) => ({
      ref: asset.ref,
      text: (
        await readFile(
          path.join(workspaceMaterialsPath(localPath), asset.ref),
          "utf8",
        )
      ).slice(0, 4000),
    })),
  );
}

function workspaceAssetUrl(workspaceId: string, ref: string) {
  return `${config.uploadUrlPrefix.replace(/\/+$/, "")}/workspace-materials/${workspaceId}/${encodeURIComponent(ref)}`;
}

function toGeneratedScript(shotPrompt: ShotPromptArtifact): GeneratedScript {
  return {
    narrative: shotPrompt.prompt,
    visualStyle: `${shotPrompt.aspectRatio} ecommerce UGC video`,
    shots: shotPrompt.shots.map((shot, index) => ({
      index: index + 1,
      durationSec: shot.endSec - shot.startSec,
      purpose:
        index === 0
          ? "hook"
          : index === shotPrompt.shots.length - 1
            ? "cta"
            : "benefit",
      visualPrompt: shot.providerPrompt,
      cameraMotion: "smooth stable product move",
      voiceover: shot.voiceover,
      subtitle: "",
    })),
  };
}

function toDbShots(generatedScript: GeneratedScript) {
  return generatedScript.shots.map((shot) => ({
    index: shot.index,
    durationSec: shot.durationSec,
    purpose: shot.purpose,
    visualPrompt: shot.visualPrompt,
    cameraMotion: shot.cameraMotion,
    voiceover: shot.voiceover,
    subtitle: shot.subtitle,
    status: "pending" as const,
  }));
}

async function getExistingScript(scriptId: string) {
  try {
    return await db.getScript(scriptId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

async function createScriptBundleForShotPrompt(input: {
  localPath: string;
  workspace: CreativeWorkspace;
  brief: ProductBriefArtifact;
  shotPrompt: ShotPromptArtifact;
}) {
  const generatedScript = toGeneratedScript(input.shotPrompt);
  const existing = await getExistingScript(input.workspace.currentScriptId);
  if (existing) {
    const script = await db.updateScript(existing.id, {
      narrative: generatedScript.narrative,
      visualStyle: generatedScript.visualStyle,
      frozen: false,
      frozenAt: undefined,
      rawJson: generatedScript,
    });
    await db.replaceShots(script.id, toDbShots(generatedScript));
    return script;
  }

  const primaryRef =
    input.shotPrompt.shots[0]?.referenceAssetRefs[0] ??
    primaryBriefAsset(input.brief);
  const storagePath = path.join(workspaceMaterialsPath(input.localPath), primaryRef);
  const fileStats = await stat(storagePath);
  const contentType =
    mimeByExtension[path.extname(primaryRef).toLowerCase()] ?? "image/png";
  const imageAsset = await db.createAsset({
    type: "product_image",
    url: workspaceAssetUrl(input.workspace.id, primaryRef),
    source: "upload",
    metadata: {
      storagePath,
      contentType,
      sizeBytes: fileStats.size,
    },
  });
  const product = await db.createProduct({
    title: input.brief.product.name,
    sellingPoints: input.brief.coreSellingPoint,
    audience: input.brief.audience.who,
    mainImageAssetId: imageAsset.id,
  });
  const script = await db.createScript({
    id: input.workspace.currentScriptId,
    productId: product.id,
    version: 1,
    narrative: generatedScript.narrative,
    visualStyle: generatedScript.visualStyle,
    frozen: false,
    rawJson: generatedScript,
  });
  await db.createShots(script.id, toDbShots(generatedScript));

  return script;
}

async function refreshWorkspaceForCurrentJob(workspace: CreativeWorkspace) {
  if (!workspace.currentJobId || workspace.status !== "video_generating") {
    return workspace;
  }

  const job = await db.getJob(workspace.currentJobId);
  if (job.status === "completed") {
    return db.updateWorkspace(workspace.id, { status: "video_ready" });
  }
  if (job.status === "failed") {
    return db.updateWorkspace(workspace.id, { status: "failed" });
  }

  return workspace;
}

function routeFeedbackTarget(feedback: string) {
  const normalized = feedback.toLowerCase();
  if (
    ["opening", "hook", "shot", "scene", "earlier", "faster"].some((term) =>
      normalized.includes(term),
    )
  ) {
    return {
      targetArtifact: "storyboard" as const,
      reason: "Feedback refers to shot timing or scene structure.",
    };
  }
  if (
    ["voice", "tts", "prompt", "negative", "caption", "text"].some((term) =>
      normalized.includes(term),
    )
  ) {
    return {
      targetArtifact: "shotprompt" as const,
      reason: "Feedback refers to generated prompt, voice, or text details.",
    };
  }
  return {
    targetArtifact: "brief" as const,
    reason: "Feedback refers to product positioning or audience assumptions.",
  };
}

function runtimeMode() {
  return process.env.MODEL_MODE === "real" ? "real" : "mock";
}

function promptViewProvider(): "ark" | "deterministic" {
  return runtimeMode() === "real" ? "ark" : "deterministic";
}

function promptViewModel() {
  return runtimeMode() === "real"
    ? process.env.ARK_TEXT_ENDPOINT_ID
    : undefined;
}

function runtimeBuilderNextAction(input: {
  stage: string;
  endpoint: string;
  runtimeBuilder: string;
}) {
  const mode = runtimeMode();
  return {
    stage: input.stage,
    endpoint: input.endpoint,
    method: "POST",
    actionType: "runtime_builder",
    runtimeBuilder: input.runtimeBuilder,
    runtimeMode: mode,
    requiresHumanApproval: false,
    willCallProvider: mode === "real",
    provider: mode === "real" ? "ark" : undefined,
    requiresProviderConfig: mode === "real",
  };
}

function humanApprovalNextAction(input: { stage: string; endpoint: string }) {
  return {
    stage: input.stage,
    endpoint: input.endpoint,
    method: "POST",
    actionType: "human_approval",
    runtimeMode: runtimeMode(),
    requiresHumanApproval: true,
    willCallProvider: false,
    requiresProviderConfig: false,
  };
}

function applyFeedbackToStoryboard(
  storyboard: StoryboardArtifact,
  feedback: string,
): StoryboardArtifact {
  const revisedScene = feedback.toLowerCase().includes("earlier")
    ? "Earlier product reveal hook"
    : "Revised opening hook";
  return storyboardArtifactSchema.parse({
    ...storyboard,
    shots: storyboard.shots.map((shot) =>
      shot.index === 0
        ? {
            ...shot,
            scene: revisedScene,
            visualDirection: `${shot.visualDirection} Adjust the opening beat to satisfy the latest routed revision while preserving the approved product claim.`,
          }
        : shot,
    ),
    assumptions: [
      ...storyboard.assumptions,
      "Latest feedback was routed to storyboard structure; review before approval.",
    ],
  });
}

function applyFeedbackToBrief(
  brief: ProductBriefArtifact,
  feedback: string,
): ProductBriefArtifact {
  const asksForAudience = /audience|人群|用户|buyer|customer/i.test(feedback);
  return productBriefArtifactSchema.parse({
    ...brief,
    audience: {
      ...brief.audience,
      painOrDesire: asksForAudience
        ? "Revised around the latest audience direction."
        : brief.audience.painOrDesire,
    },
    assumptions: [
      ...brief.assumptions,
      "Latest feedback was routed to product positioning; review before approval.",
    ],
  });
}

function applyFeedbackToShotPrompt(
  shotPrompt: ShotPromptArtifact,
  feedback: string,
): ShotPromptArtifact {
  const asksForVoice = /voice|tts|旁白|语音/i.test(feedback);
  const shots = shotPrompt.shots.map((shot, index) =>
    index === 0
      ? {
          ...shot,
          providerPrompt: `${shot.providerPrompt} Revise motion and composition according to the latest routed direction while preserving the product identity.`,
          voiceover: asksForVoice
            ? "Updated voiceover direction for the revised opening."
            : shot.voiceover,
        }
      : shot,
  );

  return shotPromptArtifactSchema.parse({
    ...shotPrompt,
    shots,
    tts: {
      ...shotPrompt.tts,
      source: "shots.voiceover",
      voiceover: shots.map((shot) => shot.voiceover.trim()).join(" "),
    },
    assumptions: [
      ...shotPrompt.assumptions,
      "Latest feedback was routed to shotprompt details; review before approval.",
    ],
  });
}

function nextActionFor(workspace: CreativeWorkspace) {
  switch (workspace.status) {
    case "draft":
      return runtimeBuilderNextAction({
        stage: "materials",
        endpoint: "/api/workspaces/material-intake",
        runtimeBuilder: "material_intake",
      });
    case "materials_ready":
      return runtimeBuilderNextAction({
        stage: "brief",
        endpoint: "/api/workspaces/brief/propose",
        runtimeBuilder: "product_brief",
      });
    case "brief_proposed":
      return humanApprovalNextAction({
        stage: "brief",
        endpoint: "/api/workspaces/artifacts/brief/approve",
      });
    case "brief_approved":
      return runtimeBuilderNextAction({
        stage: "storyboard",
        endpoint: "/api/workspaces/storyboard/propose",
        runtimeBuilder: "storyboard",
      });
    case "storyboard_proposed":
      return humanApprovalNextAction({
        stage: "storyboard",
        endpoint: "/api/workspaces/artifacts/storyboard/approve",
      });
    case "storyboard_approved":
      return runtimeBuilderNextAction({
        stage: "shotprompt",
        endpoint: "/api/workspaces/shotprompt/compile",
        runtimeBuilder: "shotprompt",
      });
    case "shotprompt_proposed":
      return humanApprovalNextAction({
        stage: "shotprompt",
        endpoint: "/api/workspaces/artifacts/shotprompt/approve",
      });
    case "shotprompt_approved":
      return {
        stage: "video",
        endpoint: "/api/workspaces/video/generate",
        method: "POST",
        actionType: "video_generation",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: runtimeMode() === "real",
        provider: runtimeMode() === "real" ? "seedance" : undefined,
        requiresProviderConfig: runtimeMode() === "real",
      };
    case "video_generating":
      return {
        stage: "video",
        endpoint: `/api/jobs/${workspace.currentJobId ?? ""}`,
        method: "GET",
        actionType: "status_poll",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
    case "video_ready":
      return {
        stage: "feedback",
        endpoint: "/api/workspaces/feedback/route",
        method: "POST",
        actionType: "feedback",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
    case "failed":
      return {
        stage: "recovery",
        endpoint: "/api/workspaces/status",
        method: "POST",
        actionType: "recovery",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: true,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
    case "missing":
      return {
        stage: "recovery",
        endpoint: "/api/workspaces/init",
        method: "POST",
        actionType: "recovery",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
  }
}

function applySelectedMaterialRefs(
  materialLibrary: Awaited<ReturnType<typeof collectWorkspaceMaterialLibrary>>,
  selectedMaterialRefs?: string[],
) {
  if (!selectedMaterialRefs?.length) {
    return materialLibrary;
  }

  const selected = new Set(selectedMaterialRefs);
  const acceptedRefs = new Set(
    materialLibrary.assets.map((asset) => asset.ref),
  );
  const invalidRefs = selectedMaterialRefs.filter(
    (ref) => !acceptedRefs.has(ref),
  );
  if (invalidRefs.length > 0) {
    throw new Error(
      `Invalid selected material refs: ${invalidRefs.join(", ")}`,
    );
  }

  const assets = materialLibrary.assets.filter((asset) =>
    selected.has(asset.ref),
  );
  const primaryProductRef =
    assets.find((asset) => asset.ref === materialLibrary.primaryProductRef)
      ?.ref ??
    assets.find((asset) => asset.kind === "image")?.ref ??
    assets[0]?.ref;

  return {
    ...materialLibrary,
    ...(primaryProductRef ? { primaryProductRef } : {}),
    assets,
  };
}

async function copySelectedLegacyRootMaterials(input: {
  directory: string;
  selectedMaterialRefs?: string[];
}) {
  if (!input.selectedMaterialRefs?.length) {
    return;
  }

  const materialDirectory = workspaceMaterialsPath(input.directory);
  await mkdir(materialDirectory, { recursive: true });

  for (const ref of input.selectedMaterialRefs) {
    const filename = safeWorkspaceFilename(ref);

    const destination = path.join(materialDirectory, filename);
    if (await fileExists(destination)) {
      continue;
    }

    try {
      workspaceMaterialMime(filename);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Unsupported material type"
      ) {
        continue;
      }
      throw error;
    }

    const source = path.join(input.directory, filename);
    if (!(await fileExists(source))) {
      continue;
    }

    const sourceStats = await stat(source);
    if (!sourceStats.isFile()) {
      continue;
    }
    if (sourceStats.size > maxWorkspaceMaterialBytes) {
      throw new Error("Material file exceeds 50MB limit");
    }

    await copyFile(source, destination);
  }
}

async function collectWorkspaceMaterialLibrary(directory: string) {
  const materialDirectory = workspaceMaterialsPath(directory);
  let entries;
  try {
    entries = await readdir(materialDirectory, { withFileTypes: true });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        scannedAt: new Date().toISOString(),
        assets: [],
        rejected: [],
      };
    }
    throw error;
  }
  const accepted: MaterialAsset[] = [];
  const rejected: Array<{ ref: string; reason: string }> = [];
  let hasPrimaryImage = false;

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || !entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    const mime = mimeByExtension[ext];
    if (!mime) {
      rejected.push({ ref: entry.name, reason: "Unsupported material type" });
      continue;
    }

    const filePath = path.join(materialDirectory, entry.name);
    const fileStats = await stat(filePath);
    if (fileStats.size > maxWorkspaceMaterialBytes) {
      rejected.push({
        ref: entry.name,
        reason: "Material file exceeds 50MB limit",
      });
      continue;
    }

    const bytes = await readFile(filePath);
    const kind = classifyKind(mime);

    if (kind === "image") {
      try {
        assertValidRasterImageBytes(bytes, mime);
      } catch (error) {
        rejected.push({
          ref: entry.name,
          reason:
            error instanceof Error ? error.message : "Invalid image material",
        });
        continue;
      }
    }

    const role = defaultRole(kind, hasPrimaryImage);
    if (role === "product_main") {
      hasPrimaryImage = true;
    }

    accepted.push({
      ref: entry.name,
      kind,
      mime,
      bytes: fileStats.size,
      sha256: sha256(bytes),
      role,
      description: `Accepted ${kind} asset ${entry.name}`,
      relevance: role === "product_main" ? "high" : "medium",
      usable: true,
      included: true,
    });
  }

  const primaryProductRef =
    accepted.find((asset) => asset.role === "product_main")?.ref ??
    accepted.find((asset) => asset.kind === "image")?.ref ??
    accepted[0]?.ref ??
    "";

  return {
    scannedAt: new Date().toISOString(),
    ...(primaryProductRef ? { primaryProductRef } : {}),
    assets: accepted,
    rejected,
  };
}

async function getOptionalWorkspaceArtifact(
  workspaceId: string,
  artifactType: string,
) {
  try {
    return await db.getWorkspaceArtifact(workspaceId, artifactType);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

async function hydrateWorkspaceArtifacts(workspaceId: string) {
  const [material, brief, storyboard, shotPrompt] = await Promise.all([
    getOptionalWorkspaceArtifact(workspaceId, "assets"),
    getOptionalWorkspaceArtifact(workspaceId, "brief"),
    getOptionalWorkspaceArtifact(workspaceId, "storyboard"),
    getOptionalWorkspaceArtifact(workspaceId, "shotprompt"),
  ]);

  return {
    material,
    brief,
    storyboard,
    shotPrompt,
  };
}

export const workspaceService = {
  async createManagedWorkspace(name?: string) {
    await mkdir(config.workspaceDir, { recursive: true });
    const directory = path.join(
      config.workspaceDir,
      `${managedWorkspaceName(name)}-${nanoid()}`,
    );
    await mkdir(directory, { recursive: true });
    return this.initialize(directory);
  },

  async listManagedWorkspaces() {
    const workspaceRoot = path.resolve(config.workspaceDir);
    const workspaces = await db.listWorkspaces();
    const managed = [];
    for (const workspace of workspaces) {
      if (
        !isInsideDirectory(path.resolve(workspace.localPath), workspaceRoot)
      ) {
        continue;
      }

      try {
        await readManifest(workspace.localPath);
        managed.push(workspace);
      } catch {
        // Workspace rows can outlive local directories during tests or manual cleanup.
      }
    }

    return {
      workspaceRoot: config.workspaceDir,
      workspaces: managed,
    };
  },

  async initialize(directory: string) {
    const localPath = normalizeWorkspacePath(directory);
    const existing = await db.findWorkspaceByLocalPath(localPath);
    const workspace =
      existing ??
      (await db.createWorkspace({
        id: nanoid(),
        localPath,
        currentScriptId: nanoid(),
        status: "draft",
        traceFile: workspaceTraceFile,
      }));
    const touched = existing ? await db.touchWorkspace(existing.id) : workspace;
    const manifest = toManifest({
      workspaceId: touched.id,
      currentScriptId: touched.currentScriptId,
      currentJobId: touched.currentJobId,
    });
    await writeManifest(localPath, manifest);

    return { workspace: touched, manifest };
  },

  async uploadMaterial(input: {
    workspaceId: string;
    filename: string;
    bytes: Uint8Array;
  }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    const requestedFilename = safeWorkspaceFilename(input.filename);
    workspaceMaterialMime(requestedFilename);
    if (input.bytes.byteLength > maxWorkspaceMaterialBytes) {
      throw new Error("Material file exceeds 50MB limit");
    }
    const bytes = Buffer.from(input.bytes);

    const materialDirectory = workspaceMaterialsPath(workspace.localPath);
    await mkdir(materialDirectory, { recursive: true });
    const filename = await uniqueWorkspaceMaterialFilename(
      materialDirectory,
      requestedFilename,
    );
    await writeFile(path.join(materialDirectory, filename), bytes);
    const touched = await db.touchWorkspace(workspace.id);

    return {
      workspace: touched,
      material: {
        ref: filename,
        bytes: bytes.byteLength,
        url: workspaceAssetUrl(workspace.id, filename),
      },
    };
  },

  async status(target: string | WorkspaceDirectoryRequest) {
    const localPath = await resolveWorkspaceLocalPath(target);
    const manifest = await readManifest(localPath);
    const touched = await db.touchWorkspace(manifest.workspaceId);
    const workspace = await refreshWorkspaceForCurrentJob(touched);
    const current = toManifest({
      workspaceId: workspace.id,
      currentScriptId: workspace.currentScriptId,
      currentJobId: workspace.currentJobId,
    });

    if (JSON.stringify(current) !== JSON.stringify(manifest)) {
      await writeManifest(localPath, current);
    }

    return {
      workspace,
      manifest: current,
      nextAction: nextActionFor(workspace),
      materialLibrary: await collectWorkspaceMaterialLibrary(localPath),
      artifacts: await hydrateWorkspaceArtifacts(workspace.id),
    };
  },

  async materialIntake(
    target:
      | string
      | (WorkspaceDirectoryRequest & { selectedMaterialRefs?: string[] }),
    prompt?: string,
  ) {
    const localPath = await resolveWorkspaceLocalPath(target);
    const { workspace } = await this.status(localPath);
    const selectedMaterialRefs =
      typeof target === "string" ? undefined : target.selectedMaterialRefs;
    await copySelectedLegacyRootMaterials({
      directory: localPath,
      selectedMaterialRefs,
    });
    const materialLibrary = await collectWorkspaceMaterialLibrary(localPath);
    const selectedLibrary = applySelectedMaterialRefs(
      materialLibrary,
      selectedMaterialRefs,
    );
    const scanned = materialIntakeArtifactSchema.parse({
      ...selectedLibrary,
      primaryProductRef: selectedLibrary.primaryProductRef ?? "",
    });
    const contract = getPipelineContractStep("material_intake");
    const textPreviews = await materialIntakeTextPreviews(localPath, scanned);
    const promptView = buildMaterialIntakePromptView({
      initialPrompt: prompt,
      scanned,
      textPreviews,
      contractId: contract.id,
      promptVersion: contract.activeVersion,
      provider: promptViewProvider(),
      ...(promptViewModel() ? { model: promptViewModel() } : {}),
    });
    let trace;
    const data =
      process.env.MODEL_MODE === "real"
        ? await (async () => {
            const result = await generateMaterialIntakeWithArk(
              {
                initialPrompt: prompt,
                scanned,
                textPreviews,
              },
              {
                imageInputs: await materialIntakeImageInputs(
                  localPath,
                  scanned,
                ),
                traceLogger: createWorkspaceTraceLogger(localPath, workspace),
              },
            );
            trace = result.trace;
            return result.material;
          })()
        : scanned;
    const artifact = await db.upsertWorkspaceArtifact({
      workspaceId: workspace.id,
      scriptId: workspace.currentScriptId,
      type: "assets",
      status: "approved",
      data,
    });
    const updatedWorkspace = await db.updateWorkspace(workspace.id, {
      status: "materials_ready",
    });

    return { workspace: updatedWorkspace, artifact, promptView, trace };
  },

  async proposeBrief(input: {
    directory?: string;
    workspaceId?: string;
    userDirection?: string;
    title?: string;
    sellingPoints?: string;
    audience?: string;
    stylePreference?: string;
  }) {
    const localPath = await resolveWorkspaceLocalPath(input);
    const { workspace } = await this.status(localPath);
    const materialArtifact = await db.getWorkspaceArtifact(
      workspace.id,
      "assets",
    );
    const material = materialIntakeArtifactSchema.parse(materialArtifact.data);
    const contract = getPipelineContractStep("product_brief");
    const promptView = buildProductBriefPromptView({
      ...input,
      material,
      contractId: contract.id,
      promptVersion: contract.activeVersion,
      provider: promptViewProvider(),
      ...(promptViewModel() ? { model: promptViewModel() } : {}),
    });
    let trace;
    const data =
      process.env.MODEL_MODE === "real"
        ? await (async () => {
            const result = await generateProductBriefWithArk(
              { ...input, material },
              {
                imageInput: await productBriefImageInput(localPath, material),
                traceLogger: createWorkspaceTraceLogger(localPath, workspace),
              },
            );
            trace = result.trace;
            return result.productBrief;
          })()
        : toProductBrief({ ...input, material });
    const artifact = await db.upsertWorkspaceArtifact({
      workspaceId: workspace.id,
      scriptId: workspace.currentScriptId,
      type: "brief",
      status: "proposed",
      data,
    });
    const updatedWorkspace = await db.updateWorkspace(workspace.id, {
      status: "brief_proposed",
    });

    return {
      workspace: updatedWorkspace,
      artifact,
      promptView,
      form: productBriefForm,
      trace,
    };
  },

  async approveBrief(
    target: string | WorkspaceDirectoryRequest,
    data: ProductBriefArtifact,
  ) {
    const localPath = await resolveWorkspaceLocalPath(target);
    const { workspace } = await this.status(localPath);
    const approvedData = productBriefArtifactSchema.parse(data);
    const artifact = await db.upsertWorkspaceArtifact({
      workspaceId: workspace.id,
      scriptId: workspace.currentScriptId,
      type: "brief",
      status: "approved",
      data: approvedData,
    });
    const updatedWorkspace = await db.updateWorkspace(workspace.id, {
      status: "brief_approved",
    });

    return { workspace: updatedWorkspace, artifact };
  },

  async proposeStoryboard(target: string | WorkspaceDirectoryRequest) {
    const localPath = await resolveWorkspaceLocalPath(target);
    const { workspace } = await this.status(localPath);
    const briefArtifact = await db.getWorkspaceArtifact(workspace.id, "brief");
    const materialArtifact = await db.getWorkspaceArtifact(
      workspace.id,
      "assets",
    );
    const brief = productBriefArtifactSchema.parse(briefArtifact.data);
    const material = materialIntakeArtifactSchema.parse(materialArtifact.data);
    const contract = getPipelineContractStep("storyboard");
    const promptView = buildStoryboardPromptView({
      brief,
      material,
      contractId: contract.id,
      promptVersion: contract.activeVersion,
      provider: promptViewProvider(),
      ...(promptViewModel() ? { model: promptViewModel() } : {}),
    });
    let trace;
    const data =
      process.env.MODEL_MODE === "real"
        ? await (async () => {
            const result = await generateStoryboardWithArk(
              { brief, material },
              {
                traceLogger: createWorkspaceTraceLogger(localPath, workspace),
              },
            );
            trace = result.trace;
            return result.storyboard;
          })()
        : toStoryboard(brief);
    const artifact = await db.upsertWorkspaceArtifact({
      workspaceId: workspace.id,
      scriptId: workspace.currentScriptId,
      type: "storyboard",
      status: "proposed",
      data,
    });
    const updatedWorkspace = await db.updateWorkspace(workspace.id, {
      status: "storyboard_proposed",
    });

    return {
      workspace: updatedWorkspace,
      artifact,
      promptView,
      form: storyboardForm,
      trace,
    };
  },

  async approveStoryboard(
    target: string | WorkspaceDirectoryRequest,
    data: StoryboardArtifact,
  ) {
    const localPath = await resolveWorkspaceLocalPath(target);
    const { workspace } = await this.status(localPath);
    const approvedData = storyboardArtifactSchema.parse(data);
    const artifact = await db.upsertWorkspaceArtifact({
      workspaceId: workspace.id,
      scriptId: workspace.currentScriptId,
      type: "storyboard",
      status: "approved",
      data: approvedData,
    });
    const updatedWorkspace = await db.updateWorkspace(workspace.id, {
      status: "storyboard_approved",
    });

    return { workspace: updatedWorkspace, artifact };
  },

  async compileShotPrompt(input: {
    directory?: string;
    workspaceId?: string;
    aspectRatio?: "9:16" | "16:9" | "1:1";
  }) {
    const localPath = await resolveWorkspaceLocalPath(input);
    const { workspace } = await this.status(localPath);
    const briefArtifact = await db.getWorkspaceArtifact(workspace.id, "brief");
    const materialArtifact = await db.getWorkspaceArtifact(
      workspace.id,
      "assets",
    );
    const storyboardArtifact = await db.getWorkspaceArtifact(
      workspace.id,
      "storyboard",
    );
    const brief = productBriefArtifactSchema.parse(briefArtifact.data);
    const material = materialIntakeArtifactSchema.parse(materialArtifact.data);
    const storyboard = storyboardArtifactSchema.parse(storyboardArtifact.data);
    const aspectRatio = input.aspectRatio ?? "9:16";
    const contract = getPipelineContractStep("shotprompt");
    const promptView = buildShotPromptPromptView({
      brief,
      material,
      storyboard,
      aspectRatio,
      contractId: contract.id,
      promptVersion: contract.activeVersion,
      provider: promptViewProvider(),
      ...(promptViewModel() ? { model: promptViewModel() } : {}),
    });
    let trace;
    const data =
      process.env.MODEL_MODE === "real"
        ? await (async () => {
            const result = await generateShotPromptWithArk(
              { brief, material, storyboard, aspectRatio },
              {
                traceLogger: createWorkspaceTraceLogger(localPath, workspace),
              },
            );
            trace = result.trace;
            return result.shotPrompt;
          })()
        : compileShotPromptArtifact(storyboard, { aspectRatio });
    const artifact = await db.upsertWorkspaceArtifact({
      workspaceId: workspace.id,
      scriptId: workspace.currentScriptId,
      type: "shotprompt",
      status: "proposed",
      data,
    });
    const updatedWorkspace = await db.updateWorkspace(workspace.id, {
      status: "shotprompt_proposed",
    });

    return {
      workspace: updatedWorkspace,
      artifact,
      promptView,
      form: shotPromptForm,
      trace,
    };
  },

  async approveShotPrompt(
    target: string | WorkspaceDirectoryRequest,
    data: ShotPromptArtifact,
  ) {
    const localPath = await resolveWorkspaceLocalPath(target);
    const { workspace } = await this.status(localPath);
    const approvedData = shotPromptArtifactSchema.parse(data);
    const artifact = await db.upsertWorkspaceArtifact({
      workspaceId: workspace.id,
      scriptId: workspace.currentScriptId,
      type: "shotprompt",
      status: "approved",
      data: approvedData,
    });
    const updatedWorkspace = await db.updateWorkspace(workspace.id, {
      status: "shotprompt_approved",
    });

    return { workspace: updatedWorkspace, artifact };
  },

  async startVideoGeneration(target: string | WorkspaceDirectoryRequest) {
    const localPath = await resolveWorkspaceLocalPath(target);
    const { workspace } = await this.status(localPath);
    const briefArtifact = await db.getWorkspaceArtifact(workspace.id, "brief");
    const shotPromptArtifact = await db.getWorkspaceArtifact(
      workspace.id,
      "shotprompt",
    );
    const brief = productBriefArtifactSchema.parse(briefArtifact.data);
    const shotPrompt = shotPromptArtifactSchema.parse(shotPromptArtifact.data);
    const script = await createScriptBundleForShotPrompt({
      localPath,
      workspace,
      brief,
      shotPrompt,
    });
    const job = await db.createJob({
      productId: script.productId,
      scriptId: script.id,
      payload: {
        workspaceId: workspace.id,
        shotprompt: shotPrompt,
      },
    });
    const updatedWorkspace = await db.updateWorkspace(workspace.id, {
      status: "video_generating",
      currentJobId: job.id,
    });
    const manifest = toManifest({
      workspaceId: updatedWorkspace.id,
      currentScriptId: updatedWorkspace.currentScriptId,
      currentJobId: updatedWorkspace.currentJobId,
    });
    await writeManifest(localPath, manifest);
    await enqueueGenerationJob({ jobId: job.id, scriptId: script.id });

    return { workspace: updatedWorkspace, manifest, job };
  },

  async routeFeedback(
    target: string | (WorkspaceDirectoryRequest & { jobId?: string }),
    feedback: string,
  ) {
    const localPath = await resolveWorkspaceLocalPath(target);
    const { workspace } = await this.status(localPath);
    const route = routeFeedbackTarget(feedback);
    const routeData = feedbackRouteArtifactSchema.parse({
      feedback,
      targetArtifact: route.targetArtifact,
      previousJobId:
        typeof target === "string"
          ? workspace.currentJobId
          : (target.jobId ?? workspace.currentJobId),
      reason: route.reason,
      routedAt: new Date().toISOString(),
    });
    const routeArtifact = await db.upsertWorkspaceArtifact({
      workspaceId: workspace.id,
      scriptId: workspace.currentScriptId,
      type: "feedbackRoute",
      status: "approved",
      data: routeData,
    });

    if (route.targetArtifact === "storyboard") {
      const storyboardArtifact = await db.getWorkspaceArtifact(
        workspace.id,
        "storyboard",
      );
      const storyboard = storyboardArtifactSchema.parse(
        storyboardArtifact.data,
      );
      const data = applyFeedbackToStoryboard(storyboard, feedback);
      const artifact = await db.upsertWorkspaceArtifact({
        workspaceId: workspace.id,
        scriptId: workspace.currentScriptId,
        type: "storyboard",
        status: "proposed",
        data,
      });
      const updatedWorkspace = await db.updateWorkspace(workspace.id, {
        status: "storyboard_proposed",
      });

      return { workspace: updatedWorkspace, routeArtifact, artifact, route };
    }

    const currentArtifact = await db.getWorkspaceArtifact(
      workspace.id,
      route.targetArtifact,
    );
    const nextData =
      route.targetArtifact === "shotprompt"
        ? applyFeedbackToShotPrompt(
            shotPromptArtifactSchema.parse(currentArtifact.data),
            feedback,
          )
        : applyFeedbackToBrief(
            productBriefArtifactSchema.parse(currentArtifact.data),
            feedback,
          );
    const artifact = await db.upsertWorkspaceArtifact({
      workspaceId: workspace.id,
      scriptId: workspace.currentScriptId,
      type: route.targetArtifact,
      status: "proposed",
      data: nextData,
    });
    const updatedWorkspace = await db.updateWorkspace(workspace.id, {
      status:
        route.targetArtifact === "shotprompt"
          ? "shotprompt_proposed"
          : "brief_proposed",
    });

    return { workspace: updatedWorkspace, routeArtifact, artifact, route };
  },
};
