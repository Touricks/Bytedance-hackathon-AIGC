import { loadWorkspaceEnv } from "../env.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  resolveArkTextProviderConfig,
  resolveArkVideoProviderConfig,
  type TextProviderConfig,
  type VideoProviderConfig
} from "../providers/provider-config.js";

console.log(
  '[disabled] smoke:real-providers is disabled. Run "pnpm --filter @aigc-video/server test:integration:smoke" for backend image/video chain smoke tests.'
);
process.exit(0);

loadWorkspaceEnv();

interface ProviderProbeResult {
  provider: TextProviderConfig["provider"];
  status: "ok";
  model: string;
  baseURL: string;
  latencyMs: number;
  outputPreview: string;
}

interface VideoConfigCheckResult {
  provider: VideoProviderConfig["provider"];
  status: "configured";
  model: string;
  baseURL: string;
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
      temperature: 1,
      topP: 0.9
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

function requireProviderConfigs(): {
  arkTextConfig: TextProviderConfig;
  arkVideoConfig: VideoProviderConfig;
} {
  const arkTextConfig = resolveArkTextProviderConfig();
  const arkVideoConfig = resolveArkVideoProviderConfig();
  const missing: string[] = [];

  if (!arkTextConfig) {
    missing.push("Ark text provider: ARK_API_KEY, ARK_BASE_URL, ARK_TEXT_ENDPOINT_ID");
  }
  if (!arkVideoConfig) {
    missing.push("Ark video provider: ARK_API_KEY, ARK_BASE_URL, ARK_VIDEO_ENDPOINT_ID");
  }
  if (missing.length > 0) {
    throw new Error(`real provider smoke requires ${missing.join("; ")}`);
  }

  return { arkTextConfig: arkTextConfig!, arkVideoConfig: arkVideoConfig! };
}

function summarizeVideoConfig(config: VideoProviderConfig): VideoConfigCheckResult {
  return {
    provider: config.provider,
    status: "configured",
    model: config.model,
    baseURL: config.baseURL
  };
}

const { arkTextConfig, arkVideoConfig } = requireProviderConfigs();
const arkTextProbe = await probeTextProvider(arkTextConfig);

console.log(
  JSON.stringify(
    {
      arkTextProbe,
      arkVideoConfig: summarizeVideoConfig(arkVideoConfig)
    },
    null,
    2
  )
);
