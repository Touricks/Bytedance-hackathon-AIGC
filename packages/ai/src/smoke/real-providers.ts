import { loadWorkspaceEnv } from "../env.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  resolveArkTextProviderConfig,
  resolveFallbackTextProviderConfig,
  type TextProviderConfig
} from "../providers/provider-config.js";

loadWorkspaceEnv();

interface ProviderProbeResult {
  provider: TextProviderConfig["provider"];
  status: "ok";
  model: string;
  baseURL: string;
  latencyMs: number;
  outputPreview: string;
}

function requireTextProviderConfig(
  config: TextProviderConfig | null,
  label: string,
  requiredVariables: string[]
): TextProviderConfig {
  if (config) {
    return config;
  }

  throw new Error(`${label} smoke requires ${requiredVariables.join(", ")}`);
}

async function probeTextProvider(
  config: TextProviderConfig
): Promise<ProviderProbeResult> {
  const startedAt = Date.now();
  const result = await generateTextWithArk(
    {
      prompt: "Reply with the single word OK.",
      content: "Reply with the single word OK."
    },
    config,
    {
      temperature: 0
    }
  );

  const output = result.output.trim();
  if (!output) {
    throw new Error(`${config.provider} smoke returned empty output`);
  }

  return {
    provider: config.provider,
    status: "ok",
    model: config.model,
    baseURL: config.baseURL,
    latencyMs: Date.now() - startedAt,
    outputPreview: output.slice(0, 80)
  };
}

const arkTextConfig = requireTextProviderConfig(
  resolveArkTextProviderConfig(),
  "Ark text provider",
  ["ARK_API_KEY", "ARK_TEXT_ENDPOINT_ID"]
);
const fallbackTextConfig = requireTextProviderConfig(
  resolveFallbackTextProviderConfig(),
  "OpenAI fallback provider",
  ["OPENAI_API_KEY", "OPENAI_MODEL"]
);

const [arkTextProbe, openaiFallbackProbe] = await Promise.all([
  probeTextProvider(arkTextConfig),
  probeTextProvider(fallbackTextConfig)
]);

console.log(
  JSON.stringify(
    {
      arkTextProbe,
      openaiFallbackProbe
    },
    null,
    2
  )
);
