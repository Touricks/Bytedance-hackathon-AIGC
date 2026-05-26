import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStoryboardPrompt } from "./storyboard.prompt.js";

const material = {
  scannedAt: "2026-05-26T00:00:00.000Z",
  primaryProductRef: "display_1.png",
  assets: [
    {
      ref: "display_1.png",
      kind: "image" as const,
      mime: "image/png",
      bytes: 100,
      sha256: "a".repeat(64),
      role: "product_main" as const,
      description: "Main product image",
      relevance: "high" as const,
      usable: true,
      included: true,
    },
  ],
  rejected: [],
};

const brief = {
  product: {
    name: "Portable Display",
    category: "desk display",
    keyFacts: ["thin stand"],
    assets: [{ ref: "display_1.png", useAs: "primary" as const }],
  },
  audience: {
    who: "desk workers",
    painOrDesire: "wants a cleaner setup",
  },
  coreSellingPoint: "space-saving desk setup",
  proof: ["Main image shows a compact display stand."],
  offer: null,
  platform: "Seedance",
  brandTone: "clean UGC",
  bannedExpressions: [],
  landingInfo: null,
  assumptions: [],
};

describe("buildStoryboardPrompt", () => {
  it("documents the exact purpose enum and non-empty material ref contract", () => {
    const prompt = buildStoryboardPrompt({ brief, material });

    assert.match(prompt, /purpose.*hook.*benefit.*proof.*cta/is);
    assert.match(prompt, /productAssetRef.*non-empty/is);
    assert.match(prompt, /productAssetRef.*approved material manifest/is);
    assert.match(prompt, /display_1\.png/);
  });
});
