import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  storyboardArtifactSchema,
  type MaterialIntakeArtifact,
  type ProductBriefArtifact,
  type StoryboardArtifact,
} from "@aigc-video/shared";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import { buildStoryboardResponseFormat } from "../contracts/response-formats.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv,
  type TextProviderConfig,
} from "../providers/provider-config.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export const ECOMMERCE_STORYBOARD_AGENT_VERSION =
  "toonflow-ecommerce-storyboard-agent.v1";

export interface GenerateStoryboardAgentInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
}

export interface GenerateStoryboardAgentOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

export interface StoryboardAgentTrace {
  promptVersion: string;
  model: string;
  provider: TextProviderConfig["provider"];
  parsedOutputStatus: "valid" | "rerun_after_supervision";
  agentStages: ["decision", "execution", "supervision"];
  supervisionScore?: number;
  supervisionIssues?: string[];
}

interface SupervisionResult {
  passed: boolean;
  score?: number;
  issues?: string[];
  suggestions?: string[];
}

const agentDir = path.dirname(fileURLToPath(import.meta.url));

async function resolveSkillPath(filename: string) {
  const candidates = [
    path.resolve(agentDir, "skills", filename),
    path.resolve(agentDir, "..", "..", "src", "agents", "skills", filename),
    path.resolve(process.cwd(), "packages", "ai", "src", "agents", "skills", filename),
    path.resolve(process.cwd(), "..", "..", "packages", "ai", "src", "agents", "skills", filename),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next path. The AI package can run from src, dist, repo root, or apps/server.
    }
  }

  throw new Error(
    `Storyboard agent skill file not found: ${filename}. Tried:\n${candidates.join("\n")}`,
  );
}

async function readSkill(filename: string) {
  return readFile(await resolveSkillPath(filename), "utf8");
}

function parseJsonObject<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Agent output is not a JSON object");
    }
    return JSON.parse(match[0]) as T;
  }
}

function materialSummary(material: MaterialIntakeArtifact) {
  return material.assets
    .filter((asset) => asset.included)
    .map(
      (asset) =>
        `${asset.ref} (${asset.kind}/${asset.role}, usable=${asset.usable}): ${asset.description}`,
    )
    .join("\n");
}

function fallbackProductAssetRef(material: MaterialIntakeArtifact) {
  return (
    material.assets.find(
      (asset) =>
        asset.ref === material.primaryProductRef &&
        asset.usable &&
        asset.included,
    )?.ref ??
    material.assets.find((asset) => asset.usable && asset.included)?.ref ??
    material.assets.find((asset) => asset.included)?.ref ??
    material.primaryProductRef
  );
}

function buildAgentContext(input: GenerateStoryboardAgentInput) {
  return [
    "## 已确认商品 brief",
    JSON.stringify(input.brief, null, 2),
    "",
    "## 已确认素材清单",
    materialSummary(input.material) || JSON.stringify(input.material.assets),
    "",
    `## 默认兜底商品素材 ref: ${fallbackProductAssetRef(input.material)}`,
  ].join("\n");
}

function localReviewStoryboard(
  input: GenerateStoryboardAgentInput,
  storyboard: StoryboardArtifact,
): SupervisionResult {
  const validRefs = new Set(
    input.material.assets
      .filter((asset) => asset.included)
      .map((asset) => asset.ref),
  );
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (storyboard.totalDurationSec > 12) {
    issues.push(`总时长 ${storyboard.totalDurationSec}s 超过 12s`);
    suggestions.push("压缩每个镜头时长，确保 totalDurationSec 不超过 12。");
  }

  const totalFromShots = storyboard.shots.reduce(
    (sum, shot) => sum + shot.durationSec,
    0,
  );
  if (totalFromShots !== storyboard.totalDurationSec) {
    issues.push(
      `shots 时长合计 ${totalFromShots}s 与 totalDurationSec ${storyboard.totalDurationSec}s 不一致`,
    );
    suggestions.push("让 totalDurationSec 与 shots[].durationSec 合计保持一致。");
  }

  if (!storyboard.shots.some((shot) => shot.purpose === "hook")) {
    issues.push("缺少 hook 镜头");
    suggestions.push("第一个镜头应承担 hook，用 1-3 秒抓住注意力。");
  }

  if (!storyboard.shots.some((shot) => shot.purpose === "cta")) {
    issues.push("缺少 cta 镜头");
    suggestions.push("最后一个镜头应包含自然转化引导。");
  }

  for (const shot of storyboard.shots) {
    if (!validRefs.has(shot.productAssetRef)) {
      issues.push(`镜头 ${shot.index} 使用了未确认素材 ref: ${shot.productAssetRef}`);
      suggestions.push(
        `镜头 ${shot.index} 的 productAssetRef 必须替换为素材清单中的 ref。`,
      );
    }
  }

  return {
    passed: issues.length === 0,
    score: Math.max(60, 100 - issues.length * 10),
    issues,
    suggestions,
  };
}

async function runDecisionAgent(input: GenerateStoryboardAgentInput, options: {
  config: TextProviderConfig;
  contractId: string;
  contractVersion: string;
  traceLogger?: Pick<FileTraceLogger, "append">;
}) {
  const system = await readSkill("storyboard_decision.md");
  const prompt = [system, "", buildAgentContext(input)].join("\n");

  await options.traceLogger?.append({
    kind: "storyboard.agent.decision_started",
    pipeline: "storyboard",
    status: "ok",
    provider: options.config.provider,
    model: options.config.model,
    contractId: options.contractId,
    contractVersion: options.contractVersion,
    meta: {
      promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
      prompt,
    },
  });

  const result = await generateTextWithArk(
    { prompt, content: prompt },
    options.config,
    {
      traceLogger: options.traceLogger,
      temperature: 0.7,
      trace: {
        pipeline: "storyboard",
        contractId: options.contractId,
        contractVersion: options.contractVersion,
        meta: {
          promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
          agentStage: "decision",
        },
      },
    },
  );

  const decision = parseJsonObject<Record<string, unknown>>(result.output);
  await options.traceLogger?.append({
    kind: "storyboard.agent.decision_completed",
    pipeline: "storyboard",
    status: "ok",
    provider: options.config.provider,
    model: options.config.model,
    contractId: options.contractId,
    contractVersion: options.contractVersion,
    meta: {
      promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
      decision,
    },
  });
  return decision;
}

async function runExecutionAgent(input: {
  source: GenerateStoryboardAgentInput;
  decision: Record<string, unknown>;
  revisionInstruction?: string;
}, options: {
  config: TextProviderConfig;
  contractId: string;
  contractVersion: string;
  traceLogger?: Pick<FileTraceLogger, "append">;
}) {
  const system = await readSkill("storyboard_execution.md");
  const responseFormat = buildStoryboardResponseFormat({
    schemaVersion: options.contractVersion,
    material: input.source.material,
  });
  const prompt = [
    system,
    "",
    buildAgentContext(input.source),
    "",
    "## Decision Agent 决策",
    JSON.stringify(input.decision, null, 2),
    input.revisionInstruction
      ? ["", "## Supervision 修改建议", input.revisionInstruction].join("\n")
      : "",
  ].join("\n");

  await options.traceLogger?.append({
    kind: "storyboard.agent.execution_started",
    pipeline: "storyboard",
    status: "ok",
    provider: options.config.provider,
    model: options.config.model,
    contractId: options.contractId,
    contractVersion: options.contractVersion,
    meta: {
      promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
      hasRevisionInstruction: Boolean(input.revisionInstruction),
    },
  });

  const result = await generateTextWithArk(
    { prompt, content: prompt },
    options.config,
    {
      traceLogger: options.traceLogger,
      responseFormat,
      temperature: input.revisionInstruction ? 0.45 : 0.65,
      trace: {
        pipeline: "storyboard",
        contractId: options.contractId,
        contractVersion: options.contractVersion,
        meta: {
          promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
          agentStage: "execution",
          hasRevisionInstruction: Boolean(input.revisionInstruction),
        },
      },
    },
  );

  const storyboard = storyboardArtifactSchema.parse(JSON.parse(result.output));
  await options.traceLogger?.append({
    kind: "storyboard.agent.execution_completed",
    pipeline: "storyboard",
    status: "ok",
    provider: options.config.provider,
    model: options.config.model,
    contractId: options.contractId,
    contractVersion: options.contractVersion,
    meta: {
      promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
      shotCount: storyboard.shots.length,
      totalDurationSec: storyboard.totalDurationSec,
    },
  });
  return storyboard;
}

async function runSupervisionAgent(input: {
  source: GenerateStoryboardAgentInput;
  storyboard: StoryboardArtifact;
}, options: {
  config: TextProviderConfig;
  contractId: string;
  contractVersion: string;
  traceLogger?: Pick<FileTraceLogger, "append">;
}) {
  const localReview = localReviewStoryboard(input.source, input.storyboard);
  const system = await readSkill("storyboard_supervision.md");
  const prompt = [
    system,
    "",
    buildAgentContext(input.source),
    "",
    "## 待审核 storyboard",
    JSON.stringify(input.storyboard, null, 2),
    "",
    "## 本地规则预检",
    JSON.stringify(localReview, null, 2),
  ].join("\n");

  const result = await generateTextWithArk(
    { prompt, content: prompt },
    options.config,
    {
      traceLogger: options.traceLogger,
      temperature: 0.2,
      trace: {
        pipeline: "storyboard",
        contractId: options.contractId,
        contractVersion: options.contractVersion,
        meta: {
          promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
          agentStage: "supervision",
        },
      },
    },
  );

  let modelReview: SupervisionResult;
  try {
    modelReview = parseJsonObject<SupervisionResult>(result.output);
  } catch {
    modelReview = { passed: true, score: 80, issues: [], suggestions: [] };
  }

  const review: SupervisionResult = {
    passed: localReview.passed && modelReview.passed,
    score: Math.min(localReview.score ?? 100, modelReview.score ?? 100),
    issues: [...(localReview.issues ?? []), ...(modelReview.issues ?? [])],
    suggestions: [
      ...(localReview.suggestions ?? []),
      ...(modelReview.suggestions ?? []),
    ],
  };

  await options.traceLogger?.append({
    kind: "storyboard.agent.supervision_completed",
    pipeline: "storyboard",
    status: review.passed ? "ok" : "error",
    provider: options.config.provider,
    model: options.config.model,
    contractId: options.contractId,
    contractVersion: options.contractVersion,
    meta: {
      promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
      review,
    },
  });

  return review;
}

export async function generateStoryboardWithAgent(
  input: GenerateStoryboardAgentInput,
  options: GenerateStoryboardAgentOptions = {},
) {
  const contract = getPipelineContractStep("storyboard");
  const env = options.env ?? process.env;
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    const message =
      "real-provider mode requires Ark text config: ARK_API_KEY and ARK_TEXT_ENDPOINT_ID";
    await options.traceLogger?.append({
      kind: "storyboard.agent.failed",
      pipeline: "storyboard",
      status: "error",
      provider: "ark",
      model: env.ARK_TEXT_ENDPOINT_ID ?? "missing",
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
        error: message,
      },
    });
    if (isRealProviderMode(env)) {
      throw new Error(message);
    }
    throw new Error("Storyboard agent requires Ark text config");
  }

  const baseOptions = {
    config,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    traceLogger: options.traceLogger,
  };
  const decision = await runDecisionAgent(input, baseOptions);
  let storyboard = await runExecutionAgent(
    { source: input, decision },
    baseOptions,
  );
  let review = await runSupervisionAgent(
    { source: input, storyboard },
    baseOptions,
  );
  let parsedOutputStatus: StoryboardAgentTrace["parsedOutputStatus"] = "valid";

  if (!review.passed) {
    parsedOutputStatus = "rerun_after_supervision";
    storyboard = await runExecutionAgent(
      {
        source: input,
        decision,
        revisionInstruction: [
          ...(review.issues ?? []).map((issue) => `问题：${issue}`),
          ...(review.suggestions ?? []).map((suggestion) => `建议：${suggestion}`),
        ].join("\n"),
      },
      baseOptions,
    );
    review = await runSupervisionAgent({ source: input, storyboard }, baseOptions);
    if (!review.passed) {
      throw new Error(
        `Storyboard agent supervision failed: ${(review.issues ?? []).join("; ")}`,
      );
    }
  }

  await options.traceLogger?.append({
    kind: "storyboard.agent.completed",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
      parsedOutputStatus,
      supervisionScore: review.score,
      supervisionIssues: review.issues,
    },
  });

  return {
    provider: "ark" as const,
    storyboard,
    trace: {
      promptVersion: ECOMMERCE_STORYBOARD_AGENT_VERSION,
      model: config.model,
      provider: config.provider,
      parsedOutputStatus,
      agentStages: ["decision", "execution", "supervision"] as const,
      supervisionScore: review.score,
      supervisionIssues: review.issues,
    } satisfies StoryboardAgentTrace,
  };
}
