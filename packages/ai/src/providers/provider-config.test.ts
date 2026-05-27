import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ARK_BASE_URL,
  resolveArkTextProviderConfig,
  resolveArkVideoProviderConfig,
  resolveFallbackTextProviderConfig
} from "./provider-config.js";

describe("provider config", () => {
  it("resolves Ark text before fallback LLM as separate provider configs", () => {
    const env = {
      ARK_API_KEY: "ark-key",
      ARK_TEXT_ENDPOINT_ID: "ark-text-endpoint",
      OPENAI_BASE_URL: "https://fallback.example/v1",
      OPENAI_API_KEY: "fallback-key",
      OPENAI_MODEL: "fallback-model"
    };

    assert.deepEqual(resolveArkTextProviderConfig(env), {
      provider: "ark",
      apiKey: "ark-key",
      model: "ark-text-endpoint",
      baseURL: DEFAULT_ARK_BASE_URL
    });
    assert.deepEqual(resolveFallbackTextProviderConfig(env), {
      provider: "fallback-llm",
      apiKey: "fallback-key",
      model: "fallback-model",
      baseURL: "https://fallback.example/v1"
    });
  });

  it("does not treat fallback LLM config as Ark text config", () => {
    const env = {
      OPENAI_BASE_URL: "https://fallback.example/v1",
      OPENAI_API_KEY: "fallback-key",
      OPENAI_MODEL: "fallback-model"
    };

    assert.equal(resolveArkTextProviderConfig(env), null);
    assert.equal(resolveFallbackTextProviderConfig(env)?.provider, "fallback-llm");
  });

  it("resolves Ark video without standalone Seedance credentials", () => {
    const env = {
      ARK_API_KEY: "ark-key",
      ARK_VIDEO_ENDPOINT_ID: "ark-video-endpoint"
    };

    assert.deepEqual(resolveArkVideoProviderConfig(env), {
      provider: "seedance",
      apiKey: "ark-key",
      model: "ark-video-endpoint",
      baseURL: DEFAULT_ARK_BASE_URL
    });
  });
});
