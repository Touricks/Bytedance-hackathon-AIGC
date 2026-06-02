import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runStoryboardImagePromptAgent } from "./storyboard-image-prompt.workflow.js";

describe("runStoryboardImagePromptAgent", () => {
  it("returns strict-schema mock output that stays inside the still-image boundary", async () => {
    process.env.MODEL_MODE = "mock";

    const result = await runStoryboardImagePromptAgent({
      context: {
        workspaceId: "ws_test",
        shotId: "shot_test",
        traceId: "trace_test",
        runtimeMode: "mock",
      },
      payload: {
        productBrief: { product: { name: "测试商品" } },
        materialIntake: { assets: [] },
        shot: {
          index: 1,
          objective: "展示商品在桌面上的精致质感",
          providerPromptFromShotPrompt: "商品展示镜头",
          shotImage: { scene: "桌面静物" },
        },
        image_ref: "asset_previous_still",
        referenceAssets: [{ id: "asset_product", role: "product_identity", summary: "主商品图" }],
      },
    });

    assert.equal(result.output.negativePrompt, "商品变形、文字模糊、场景突变");
    assert.equal(result.output.visualStyle, null);
    assert.equal(result.output.composition, null);
    assert.equal(result.output.lighting, null);
    assert.equal(result.output.referenceImageUsage.length, 2);

    const outputText = JSON.stringify(result.output);
    assert.doesNotMatch(outputText, /cameraMotion|duration|voiceover|first frame|last frame|transition/i);
  });
});
