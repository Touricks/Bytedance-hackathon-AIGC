import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeMaterialIntakePrimaryRole,
  type MaterialIntakeArtifact
} from "./artifacts.js";

const baseMaterial: MaterialIntakeArtifact = {
  scannedAt: "2026-06-08T00:00:00.000Z",
  primaryProductRef: "hero.jpg",
  assets: [
    {
      ref: "hero.jpg",
      kind: "image",
      mime: "image/jpeg",
      bytes: 10,
      sha256: "a".repeat(64),
      role: "reference",
      description: "商品整体图",
      relevance: "high",
      usable: true,
      included: true
    },
    {
      ref: "detail.jpg",
      kind: "image",
      mime: "image/jpeg",
      bytes: 11,
      sha256: "b".repeat(64),
      role: "product_main",
      description: "商品细节图",
      relevance: "high",
      usable: true,
      included: true
    },
    {
      ref: "demo.mp4",
      kind: "video",
      mime: "video/mp4",
      bytes: 12,
      sha256: "c".repeat(64),
      role: "product_main",
      description: "商品演示视频",
      relevance: "medium",
      usable: true,
      included: true
    }
  ],
  rejected: []
};

describe("material intake artifact normalization", () => {
  it("keeps only primaryProductRef as product_main", () => {
    const normalized = normalizeMaterialIntakePrimaryRole(baseMaterial);
    const productMainRefs = normalized.assets
      .filter((asset) => asset.role === "product_main")
      .map((asset) => asset.ref);

    assert.deepEqual(productMainRefs, ["hero.jpg"]);
    assert.equal(
      normalized.assets.find((asset) => asset.ref === "detail.jpg")?.role,
      "product_detail"
    );
    assert.equal(
      normalized.assets.find((asset) => asset.ref === "demo.mp4")?.role,
      "demo_video"
    );
  });
});
