import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getPipelineContracts,
  getPipelineContractStep
} from "./pipeline.contracts.js";

const originalOverrides = process.env.AIGC_VIDEO_PIPELINE_CONTRACT_OVERRIDES;
const originalSet = process.env.AIGC_VIDEO_PIPELINE_CONTRACT_SET;

afterEach(() => {
  if (originalOverrides === undefined) {
    delete process.env.AIGC_VIDEO_PIPELINE_CONTRACT_OVERRIDES;
  } else {
    process.env.AIGC_VIDEO_PIPELINE_CONTRACT_OVERRIDES = originalOverrides;
  }
  if (originalSet === undefined) {
    delete process.env.AIGC_VIDEO_PIPELINE_CONTRACT_SET;
  } else {
    process.env.AIGC_VIDEO_PIPELINE_CONTRACT_SET = originalSet;
  }
});

describe("pipeline contract registry", () => {
  it("uses default V1 contract versions", () => {
    const registry = getPipelineContracts();

    assert.equal(registry.contractSet, "v1");
    assert.deepEqual(
      registry.steps.map((step) => [step.id, step.activeVersion]),
      [
        ["material_intake", "material-intake.v1"],
        ["product_brief", "product-brief.v1"],
        ["storyboard", "ugc-storyboard.v1"],
        ["shotprompt", "video-shotprompt.v1"],
        ["video_export", "seedance-video-export.v1"]
      ]
    );
  });

  it("supports repo-level active contract version overrides", () => {
    process.env.AIGC_VIDEO_PIPELINE_CONTRACT_SET = "local-exp";
    process.env.AIGC_VIDEO_PIPELINE_CONTRACT_OVERRIDES = JSON.stringify({
      material_intake: "material-intake.local-exp",
      video_export: "seedance-video-export.local-exp"
    });

    const registry = getPipelineContracts();
    const material = getPipelineContractStep("material_intake");
    const video = getPipelineContractStep("video_export");

    assert.equal(registry.contractSet, "local-exp");
    assert.equal(material.activeVersion, "material-intake.local-exp");
    assert.equal(video.activeVersion, "seedance-video-export.local-exp");
  });
});
