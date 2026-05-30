import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveArkTextProviderConfig,
  resolveArkVideoProviderConfig
} from "./provider-config.js";

describe("provider config", () => {
  it("resolves Ark text provider config", () => {
    const env = {
      ARK_API_KEY: "ark-key",
      ARK_BASE_URL: "https://ark.example/api/v3",
      ARK_TEXT_ENDPOINT_ID: "ark-text-endpoint"
    };

    assert.deepEqual(resolveArkTextProviderConfig(env), {
      provider: "ark",
      apiKey: "ark-key",
      model: "ark-text-endpoint",
      baseURL: "https://ark.example/api/v3"
    });
  });

  it("requires Ark text credentials for text provider config", () => {
    assert.equal(resolveArkTextProviderConfig({}), null);
  });

  it("resolves Ark video without standalone Seedance credentials", () => {
    const env = {
      ARK_API_KEY: "ark-key",
      ARK_BASE_URL: "https://ark.example/api/v3",
      ARK_VIDEO_ENDPOINT_ID: "ark-video-endpoint"
    };

    assert.deepEqual(resolveArkVideoProviderConfig(env), {
      provider: "seedance",
      apiKey: "ark-key",
      model: "ark-video-endpoint",
      baseURL: "https://ark.example/api/v3"
    });
  });
});
