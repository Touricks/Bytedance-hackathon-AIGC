import {
  feedbackRouteArtifactSchema,
  type FeedbackRouteArtifact,
  type ProductBriefArtifact,
  type ShotPromptArtifact,
  type StoryboardArtifact,
} from "@aigc-video/shared";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import { buildFeedbackRouteResponseFormat } from "../contracts/response-formats.js";
import {
  buildFeedbackRoutePrompt,
  FEEDBACK_ROUTE_PROMPT_VERSION,
} from "../prompts/feedback-route.prompt.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv,
  type TextProviderConfig,
} from "../providers/provider-config.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

type FeedbackRouteDecision = Pick<
  FeedbackRouteArtifact,
  "targetArtifact" | "reason" | "revisionInstruction" | "confidence"
>;

export interface GenerateFeedbackRouteInput {
  feedback: string;
  brief: ProductBriefArtifact;
  storyboard: StoryboardArtifact;
  shotPrompt: ShotPromptArtifact;
}

export interface FeedbackRouteTrace {
  promptVersion: string;
  model: string;
  provider: TextProviderConfig["provider"];
  parsedOutputStatus: "valid";
}

export interface GenerateFeedbackRouteOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

const feedbackRouteDecisionSchema = feedbackRouteArtifactSchema.pick({
  targetArtifact: true,
  reason: true,
  revisionInstruction: true,
  confidence: true,
});

function parseFeedbackRoute(rawOutput: string): FeedbackRouteDecision {
  return feedbackRouteDecisionSchema.parse(JSON.parse(rawOutput));
}

export async function generateFeedbackRouteWithArk(
  input: GenerateFeedbackRouteInput,
  options: GenerateFeedbackRouteOptions = {},
) {
  const contract = getPipelineContractStep("feedback_route");
  const env = options.env ?? process.env;
  const prompt = buildFeedbackRoutePrompt(input);
  const responseFormat = buildFeedbackRouteResponseFormat(
    contract.activeVersion,
  );
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    const message =
      "real-provider mode requires Ark text config: ARK_API_KEY, ARK_BASE_URL, and ARK_TEXT_ENDPOINT_ID";
    await options.traceLogger?.append({
      kind: "feedback_route.failed",
      pipeline: "feedback",
      status: "error",
      provider: "ark",
      model: env.ARK_TEXT_ENDPOINT_ID ?? "missing",
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: FEEDBACK_ROUTE_PROMPT_VERSION,
        parsedOutputStatus: "not_attempted",
        error: message,
      },
    });
    if (isRealProviderMode(env)) {
      throw new Error(message);
    }
    throw new Error("Feedback route runtime builder requires Ark text config");
  }

  await options.traceLogger?.append({
    kind: "feedback_route.request_prepared",
    pipeline: "feedback",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: FEEDBACK_ROUTE_PROMPT_VERSION,
      parsedOutputStatus: "not_parsed",
      prompt,
    },
  });

  const rawOutput = (
    await generateTextWithArk(
      { prompt, content: prompt },
      config,
      {
        traceLogger: options.traceLogger,
        responseFormat,
        trace: {
          pipeline: "feedback",
          contractId: contract.id,
          contractVersion: contract.activeVersion,
          meta: {
            promptVersion: FEEDBACK_ROUTE_PROMPT_VERSION,
            contractId: contract.id,
            contractVersion: contract.activeVersion,
            parsedOutputStatus: "not_parsed",
          },
        },
      },
    )
  ).output;

  let route: FeedbackRouteDecision;
  try {
    route = parseFeedbackRoute(rawOutput);
  } catch (error) {
    await options.traceLogger?.append({
      kind: "feedback_route.parse_failed",
      pipeline: "feedback",
      status: "error",
      provider: config.provider,
      model: config.model,
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: FEEDBACK_ROUTE_PROMPT_VERSION,
        parsedOutputStatus: "invalid",
        error: error instanceof Error ? error.message : "Unknown parse failure",
      },
    });
    throw error;
  }

  await options.traceLogger?.append({
    kind: "feedback_route.parsed",
    pipeline: "feedback",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: FEEDBACK_ROUTE_PROMPT_VERSION,
      parsedOutputStatus: "valid",
    },
  });

  return {
    provider: "ark" as const,
    route,
    trace: {
      promptVersion: FEEDBACK_ROUTE_PROMPT_VERSION,
      model: config.model,
      provider: config.provider,
      parsedOutputStatus: "valid" as const,
    },
  };
}
