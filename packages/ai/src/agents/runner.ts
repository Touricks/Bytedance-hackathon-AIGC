import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, Runner, OpenAIProvider } from "@openai/agents";
import type { TaskProviderConfig } from "../providers/provider-config.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadSystemPrompt(relativePath: string): string {
  return readFileSync(path.join(here, "..", "prompts", relativePath), "utf8");
}

export interface RunnerContext {
  workspaceId: string;
  shotId?: string;
  traceId: string;
  runtimeMode: "real" | "mock";
}

/**
 * Build a Runner bound to an OpenAI-compatible endpoint.
 *
 * Deviation from plan: the plan called for constructing an
 * `OpenAIChatCompletionsModel` directly and passing a zero-arg `getModel`.
 * In v0.0.5 the `ModelProvider` interface requires `getModel(modelName?)`,
 * and the SDK ships `OpenAIProvider` which accepts `apiKey`/`baseURL` and
 * resolves models by name. By default we keep the Chat Completions path
 * for broad OpenAI-compatible endpoint support; structured-output agents
 * can opt into the Responses path with `useResponses: true`.
 */
export function buildRunner(
  cfg: TaskProviderConfig,
  options: { useResponses?: boolean } = {},
): Runner {
  const provider = new OpenAIProvider({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    useResponses: options.useResponses ?? false,
  });
  return new Runner({ modelProvider: provider });
}

export interface RunAgentInput<TInput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: Agent<any, any>;
  input: TInput;
  context: RunnerContext;
  runner: Runner;
  maxTurns?: number;
}

export async function runAgent<TInput, TOutput>(args: RunAgentInput<TInput>): Promise<TOutput> {
  const result = await args.runner.run(args.agent, JSON.stringify(args.input), {
    context: args.context,
    maxTurns: args.maxTurns ?? 6,
  });
  if (!result.finalOutput) {
    throw new Error("AGENT_EMPTY_FINAL_OUTPUT");
  }
  return result.finalOutput as TOutput;
}
