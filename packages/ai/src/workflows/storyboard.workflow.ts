import {
  storyboardArtifactSchema,
  validateP0StoryboardScript,
  type MaterialIntakeArtifact,
  type ProductBriefArtifact,
  type StoryboardArtifact
} from "@aigc-video/shared";
import {
  buildStoryboardVoiceoverRewritePrompt,
  buildStoryboardPrompt,
  STORYBOARD_PROMPT_VERSION
} from "../prompts/storyboard.prompt.js";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv,
  type TextProviderConfig
} from "../providers/provider-config.js";
import {
  buildStoryboardResponseFormat,
  buildStoryboardVoiceoverRewriteResponseFormat
} from "../contracts/response-formats.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export interface GenerateStoryboardInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  creativeRequirements?: unknown;
}

export interface RewriteStoryboardVoiceoversInput
  extends GenerateStoryboardInput {
  storyboard: StoryboardArtifact;
  userDirection?: string;
}

export interface StoryboardTrace {
  promptVersion: string;
  model: string;
  provider: TextProviderConfig["provider"];
  parsedOutputStatus: "valid" | "repaired";
}

export interface GenerateStoryboardOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

function parseStoryboard(rawOutput: string): StoryboardArtifact {
  const storyboard = storyboardArtifactSchema.parse(JSON.parse(rawOutput));
  assertValidP0Storyboard(storyboard);
  return storyboard;
}

function parseVoiceoverRewrite(
  rawOutput: string,
  input: RewriteStoryboardVoiceoversInput
): StoryboardArtifact {
  const candidate = JSON.parse(rawOutput) as unknown;
  if (!isRecord(candidate) || !Array.isArray(candidate.shots)) {
    throw new Error("Storyboard voiceover rewrite output must contain shots");
  }

  const voiceovers = new Map<number, string>();
  for (const item of candidate.shots) {
    if (
      !isRecord(item) ||
      typeof item.index !== "number" ||
      !Number.isInteger(item.index) ||
      typeof item.voiceover !== "string" ||
      !item.voiceover.trim()
    ) {
      throw new Error("Storyboard voiceover rewrite shot is invalid");
    }
    voiceovers.set(item.index, item.voiceover.trim());
  }
  if (voiceovers.size !== input.storyboard.shots.length) {
    throw new Error("Storyboard voiceover rewrite shot count mismatch");
  }

  const storyboard = storyboardArtifactSchema.parse({
    ...input.storyboard,
    shots: input.storyboard.shots.map((shot) => {
      const voiceover = voiceovers.get(shot.index);
      if (!voiceover) {
        throw new Error(`Missing rewritten voiceover for shot ${shot.index}`);
      }
      return { ...shot, voiceover };
    })
  });
  assertValidP0Storyboard(storyboard);
  return storyboard;
}

type StoryboardPurpose = StoryboardArtifact["shots"][number]["purpose"];

interface StoryboardRepairChange {
  path: string;
  from: unknown;
  to: unknown;
  reason: string;
}

const purposeRepairs: Record<string, StoryboardPurpose> = {
  benefit: "proof",
  "pain point reinforcement": "proof",
  "product reveal": "proof",
  "scenario verification": "proof",
  "core selling point display": "proof",
  "conversion guide": "cta"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizePurpose(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function repairPurpose(value: unknown): StoryboardPurpose | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizePurpose(value);
  if (
    normalized === "hook" ||
    normalized === "proof" ||
    normalized === "cta"
  ) {
    return normalized;
  }
  return purposeRepairs[normalized] ?? null;
}

function fallbackProductAssetRef(material: MaterialIntakeArtifact) {
  return (
    material.assets.find(
      (asset) =>
        asset.ref === material.primaryProductRef && asset.usable && asset.included
    )?.ref ??
    material.assets.find((asset) => asset.usable && asset.included)?.ref ??
    material.assets.find((asset) => asset.included)?.ref ??
    material.primaryProductRef
  );
}

function repairStoryboard(
  rawOutput: string,
  input: GenerateStoryboardInput
): { storyboard: StoryboardArtifact; changes: StoryboardRepairChange[] } {
  const candidate = JSON.parse(rawOutput) as unknown;
  if (!isRecord(candidate)) {
    throw new Error("Storyboard output must be a JSON object");
  }

  const repaired = structuredClone(candidate);
  const changes: StoryboardRepairChange[] = [];
  const shots = Array.isArray(repaired.shots) ? repaired.shots : [];
  const productAssetRef = fallbackProductAssetRef(input.material);

  shots.forEach((shot, index) => {
    if (!isRecord(shot)) {
      return;
    }

    const purpose = repairPurpose(shot.purpose);
    if (purpose && purpose !== shot.purpose) {
      changes.push({
        path: `shots[${index}].purpose`,
        from: shot.purpose,
        to: purpose,
        reason: "Mapped common provider purpose label to storyboard enum"
      });
      shot.purpose = purpose;
    }

    if (typeof shot.productAssetRef !== "string" || !shot.productAssetRef.trim()) {
      changes.push({
        path: `shots[${index}].productAssetRef`,
        from: shot.productAssetRef,
        to: productAssetRef,
        reason: "Filled empty productAssetRef from approved material manifest"
      });
      shot.productAssetRef = productAssetRef;
    }
  });

  const storyboard = storyboardArtifactSchema.parse(repaired);
  assertValidP0Storyboard(storyboard);
  return { storyboard, changes };
}

function parseErrorSummary(error: unknown) {
  if (error instanceof SyntaxError) {
    return "Provider output was not valid JSON";
  }
  if (error instanceof Error && error.message.includes("P0 storyboard")) {
    return error.message;
  }
  return "Provider output did not match the storyboard schema";
}

function assertValidP0Storyboard(storyboard: StoryboardArtifact) {
  const result = validateP0StoryboardScript(storyboard);
  if (!result.valid) {
    throw new Error(
      `Provider output did not match P0 storyboard script rules: ${result.issues
        .map((issue) => issue.message)
        .join(" ")}`
    );
  }
}

export async function generateStoryboardWithArk(
  input: GenerateStoryboardInput,
  options: GenerateStoryboardOptions = {}
) {
  const contract = getPipelineContractStep("storyboard");
  const env = options.env ?? process.env;
  const prompt = buildStoryboardPrompt(input);
  const responseFormat = buildStoryboardResponseFormat({
    schemaVersion: contract.activeVersion,
    material: input.material
  });
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    const message =
      "real-provider mode requires Ark text config: ARK_API_KEY, ARK_BASE_URL, and ARK_TEXT_ENDPOINT_ID";
    await options.traceLogger?.append({
      kind: "storyboard.failed",
      pipeline: "storyboard",
      status: "error",
      provider: "ark",
      model: env.ARK_TEXT_ENDPOINT_ID ?? "missing",
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: STORYBOARD_PROMPT_VERSION,
        parsedOutputStatus: "not_attempted",
        error: message
      }
    });
    if (isRealProviderMode(env)) {
      throw new Error(message);
    }
    throw new Error("Storyboard runtime builder requires Ark text config");
  }

  await options.traceLogger?.append({
    kind: "storyboard.request_prepared",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: STORYBOARD_PROMPT_VERSION,
      parsedOutputStatus: "not_parsed",
      prompt
    }
  });
  const rawOutput = (
    await generateTextWithArk(
      { prompt, content: prompt },
      config,
      {
        traceLogger: options.traceLogger,
        responseFormat,
        trace: {
          pipeline: "storyboard",
          contractId: contract.id,
          contractVersion: contract.activeVersion,
          meta: {
            promptVersion: STORYBOARD_PROMPT_VERSION,
            contractId: contract.id,
            contractVersion: contract.activeVersion,
            parsedOutputStatus: "not_parsed"
          }
        }
      }
    )
  ).output;
  let storyboard: StoryboardArtifact;
  let parsedOutputStatus: StoryboardTrace["parsedOutputStatus"] = "valid";
  try {
    storyboard = parseStoryboard(rawOutput);
  } catch (error) {
    await options.traceLogger?.append({
      kind: "storyboard.parse_failed",
      pipeline: "storyboard",
      status: "error",
      provider: config.provider,
      model: config.model,
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: STORYBOARD_PROMPT_VERSION,
        parsedOutputStatus: "invalid",
        rawOutput,
        error: parseErrorSummary(error)
      }
    });
    try {
      const repaired = repairStoryboard(rawOutput, input);
      storyboard = repaired.storyboard;
      parsedOutputStatus = "repaired";
      await options.traceLogger?.append({
        kind: "storyboard.repaired",
        pipeline: "storyboard",
        status: "ok",
        provider: config.provider,
        model: config.model,
        contractId: contract.id,
        contractVersion: contract.activeVersion,
        meta: {
          promptVersion: STORYBOARD_PROMPT_VERSION,
          parsedOutputStatus,
          changes: repaired.changes
        }
      });
    } catch (repairError) {
      await options.traceLogger?.append({
        kind: "storyboard.repair_failed",
        pipeline: "storyboard",
        status: "error",
        provider: config.provider,
        model: config.model,
        contractId: contract.id,
        contractVersion: contract.activeVersion,
        meta: {
          promptVersion: STORYBOARD_PROMPT_VERSION,
          parsedOutputStatus: "repair_failed",
          error: parseErrorSummary(repairError)
        }
      });
      throw new Error(
        "Storyboard provider output could not be repaired to match required schema."
      );
    }
  }
  await options.traceLogger?.append({
    kind: "storyboard.parsed",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: STORYBOARD_PROMPT_VERSION,
      parsedOutputStatus
    }
  });

  return {
    provider: "ark" as const,
    storyboard,
    trace: {
      promptVersion: STORYBOARD_PROMPT_VERSION,
      model: config.model,
      provider: config.provider,
      parsedOutputStatus
    }
  };
}

export async function rewriteStoryboardVoiceoversWithArk(
  input: RewriteStoryboardVoiceoversInput,
  options: GenerateStoryboardOptions = {}
) {
  const contract = getPipelineContractStep("storyboard");
  const env = options.env ?? process.env;
  const prompt = buildStoryboardVoiceoverRewritePrompt(input);
  const responseFormat = buildStoryboardVoiceoverRewriteResponseFormat({
    schemaVersion: contract.activeVersion,
    expectedShotCount: input.storyboard.shots.length
  });
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    const message =
      "real-provider mode requires Ark text config: ARK_API_KEY, ARK_BASE_URL, and ARK_TEXT_ENDPOINT_ID";
    await options.traceLogger?.append({
      kind: "storyboard.voiceover.failed",
      pipeline: "storyboard",
      status: "error",
      provider: "ark",
      model: env.ARK_TEXT_ENDPOINT_ID ?? "missing",
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: STORYBOARD_PROMPT_VERSION,
        parsedOutputStatus: "not_attempted",
        error: message
      }
    });
    if (isRealProviderMode(env)) {
      throw new Error(message);
    }
    throw new Error("Storyboard voiceover rewrite requires Ark text config");
  }

  await options.traceLogger?.append({
    kind: "storyboard.voiceover.request_prepared",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: STORYBOARD_PROMPT_VERSION,
      parsedOutputStatus: "not_parsed",
      prompt
    }
  });

  const rawOutput = (
    await generateTextWithArk(
      { prompt, content: prompt },
      config,
      {
        traceLogger: options.traceLogger,
        responseFormat,
        trace: {
          pipeline: "storyboard",
          contractId: contract.id,
          contractVersion: contract.activeVersion,
          meta: {
            promptVersion: STORYBOARD_PROMPT_VERSION,
            contractId: contract.id,
            contractVersion: contract.activeVersion,
            parsedOutputStatus: "not_parsed",
            rewriteKind: "voiceover"
          }
        }
      }
    )
  ).output;

  const storyboard = parseVoiceoverRewrite(rawOutput, input);
  await options.traceLogger?.append({
    kind: "storyboard.voiceover.parsed",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: STORYBOARD_PROMPT_VERSION,
      parsedOutputStatus: "valid"
    }
  });

  return {
    provider: "ark" as const,
    storyboard,
    trace: {
      promptVersion: STORYBOARD_PROMPT_VERSION,
      model: config.model,
      provider: config.provider,
      parsedOutputStatus: "valid" as const
    }
  };
}
