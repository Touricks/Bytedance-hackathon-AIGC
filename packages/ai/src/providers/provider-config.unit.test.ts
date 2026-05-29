import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveTextProviderConfig,
  resolveImageProviderConfig,
  resolveVideoProviderConfig,
  maskSecret,
} from "./provider-config.js";

describe("resolveTextProviderConfig", () => {
  it("prefers TEXT_* over ARK_* aliases", () => {
    const cfg = resolveTextProviderConfig({
      TEXT_API_KEY: "new-key",
      TEXT_BASE_URL: "https://new.example/v1",
      TEXT_ENDPOINT_ID: "new-endpoint",
      ARK_API_KEY: "old-key",
      ARK_BASE_URL: "https://old.example/v1",
      ARK_TEXT_ENDPOINT_ID: "old-endpoint",
    });
    assert.deepEqual(cfg, {
      task: "text",
      provider: "ark",
      apiKey: "new-key",
      baseURL: "https://new.example/v1",
      endpointId: "new-endpoint",
    });
  });

  it("falls back to ARK_* when TEXT_* not set", () => {
    const cfg = resolveTextProviderConfig({
      ARK_API_KEY: "ak",
      ARK_BASE_URL: "https://ark.example/v1",
      ARK_TEXT_ENDPOINT_ID: "tx",
    });
    assert.equal(cfg?.apiKey, "ak");
    assert.equal(cfg?.endpointId, "tx");
  });

  it("returns null when required keys missing", () => {
    assert.equal(resolveTextProviderConfig({ ARK_API_KEY: "k" }), null);
    assert.equal(resolveTextProviderConfig({ ARK_TEXT_ENDPOINT_ID: "e" }), null);
  });
});

describe("resolveImageProviderConfig", () => {
  it("requires IMAGE_API_KEY and IMAGE_ENDPOINT_ID (no ARK fallback)", () => {
    assert.equal(
      resolveImageProviderConfig({
        ARK_API_KEY: "k",
        ARK_VIDEO_ENDPOINT_ID: "v",
      }),
      null,
    );
    assert.deepEqual(
      resolveImageProviderConfig({
        IMAGE_API_KEY: "ik",
        IMAGE_ENDPOINT_ID: "ie",
      }),
      {
        task: "image",
        provider: "ark-seedream",
        apiKey: "ik",
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
        endpointId: "ie",
      },
    );
  });
});

describe("resolveVideoProviderConfig", () => {
  it("falls back to ARK_VIDEO_ENDPOINT_ID", () => {
    const cfg = resolveVideoProviderConfig({
      ARK_API_KEY: "ak",
      ARK_VIDEO_ENDPOINT_ID: "vid",
    });
    assert.equal(cfg?.endpointId, "vid");
  });
});

describe("maskSecret", () => {
  it("preserves first 4 and last 4 chars", () => {
    assert.equal(maskSecret("abcd1234efghij"), "abcd****ghij");
  });
  it("masks short secrets fully", () => {
    assert.equal(maskSecret("short"), "****");
    assert.equal(maskSecret(""), "");
  });
});
