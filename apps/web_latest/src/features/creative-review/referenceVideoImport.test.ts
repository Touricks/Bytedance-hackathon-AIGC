import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  requirementFormFromImportedDraft,
  requirementFormFromArtifact,
} from "./CreativeReviewDesk.js";

describe("reference video requirements import mapping", () => {
  it("maps imported draft fields into the existing seven requirements form fields", () => {
    const fallback = requirementFormFromArtifact(null);
    const form = requirementFormFromImportedDraft(
      {
        image: {
          style: "真实电商产品摄影",
          composition: "主体稳定",
          avoid: ["文字贴片", "商品变形"],
        },
        script: {
          tone: "直接可信",
          structure: "开场痛点，中段证明，结尾行动引导",
        },
        storyboard: {
          rhythm: "快节奏卖点证明",
          beats: ["吸引注意", "展示卖点"],
        },
        shotImage: {
          global: "分镜图保持场景连续",
        },
        shotVideo: {
          global: "镜头运动平滑",
        },
      },
      fallback,
    );

    assert.deepEqual(form, {
      imageStyle: "真实电商产品摄影",
      imageComposition: "主体稳定",
      imageAvoid: "文字贴片，商品变形",
      scriptTone: "直接可信",
      storyboardRhythm: "快节奏卖点证明",
      shotImageGlobal: "分镜图保持场景连续",
      shotVideoGlobal: "镜头运动平滑",
    });
  });
});
