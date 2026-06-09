import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMaterialIntakePrompt } from "./material-intake.prompt.js";

const material = {
  scannedAt: "2026-06-02T00:00:00.000Z",
  primaryProductRef: "product.png",
  assets: [
    {
      ref: "product.png",
      kind: "image" as const,
      mime: "image/png",
      bytes: 100,
      sha256: "a".repeat(64),
      role: "product_main" as const,
      description: "默认主商品图",
      relevance: "high" as const,
      usable: true,
      included: true,
    },
  ],
  rejected: [],
};

describe("buildMaterialIntakePrompt", () => {
  it("instructs detailed product_main/product_detail descriptions for downstream image generation", () => {
    const prompt = buildMaterialIntakePrompt({
      initialPrompt: "识别主商品素材",
      scanned: material,
    });

    // Richer, vision-grounded description guidance must reach the runtime prompt.
    assert.match(prompt, /供下游图像生成直接使用/);
    assert.match(prompt, /尺寸感知/);
    assert.match(prompt, /五金\/配件/);
    // Still anchored to the verified manifest.
    assert.match(prompt, /product\.png/);
  });
});
