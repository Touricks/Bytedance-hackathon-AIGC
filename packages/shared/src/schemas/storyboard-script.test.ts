import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StoryboardArtifact } from "./artifacts.js";
import {
  STORYBOARD_SCRIPT_DEFAULT_DURATIONS,
  STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
  redistributeP0StoryboardDurations,
  storyboardScriptVoiceoverCount,
  validateP0StoryboardScript,
} from "./storyboard-script.js";

function validStoryboard(overrides: Partial<StoryboardArtifact> = {}): StoryboardArtifact {
  return {
    narrative: "开场钩子到卖点证明再到行动号召。",
    totalDurationSec: STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
    shots: [
      {
        index: 0,
        purpose: "hook",
        durationSec: STORYBOARD_SCRIPT_DEFAULT_DURATIONS[0],
        scene: "用一句痛点提问抓住注意力",
        visualDirection: "真实场景开场",
        productAssetRef: "product.jpg",
        voiceover: "换季脸干到起皮了吗",
        transition: "cut",
      },
      {
        index: 1,
        purpose: "proof",
        durationSec: STORYBOARD_SCRIPT_DEFAULT_DURATIONS[1],
        scene: "解释核心卖点并展示使用或证据",
        visualDirection: "产品和证明素材结合",
        productAssetRef: "product.jpg",
        voiceover: "山茶花籽油亲肤好吸收整晚修护",
        transition: "cut",
      },
      {
        index: 2,
        purpose: "cta",
        durationSec: STORYBOARD_SCRIPT_DEFAULT_DURATIONS[2],
        scene: "收束到购买利益点",
        visualDirection: "产品和利益点同屏",
        productAssetRef: "product.jpg",
        voiceover: "现在下单立减五十",
        transition: "fade",
      },
    ],
    assumptions: [],
    ...overrides,
  };
}

describe("P0 storyboard script rules", () => {
  it("accepts the default three-beat 15 second script and reports voiceover budgets", () => {
    const result = validateP0StoryboardScript(validStoryboard());

    assert.equal(result.valid, true);
    assert.deepEqual(result.durations, [4, 7, 4]);
    assert.deepEqual(
      result.shots.map((shot) => ({
        index: shot.index,
        count: shot.voiceoverCount,
        limit: shot.voiceoverLimit,
        overLimit: shot.voiceoverOverLimit,
      })),
      [
        { index: 0, count: 9, limit: 20, overLimit: false },
        { index: 1, count: 14, limit: 35, overLimit: false },
        { index: 2, count: 8, limit: 20, overLimit: false },
      ],
    );
    assert.equal(storyboardScriptVoiceoverCount(" 今 天\nabc "), 5);
  });

  it("redistributes adjacent durations in integer seconds without changing total duration", () => {
    assert.deepEqual(redistributeP0StoryboardDurations([4, 7, 4], 0, 1), [5, 6, 4]);
    assert.deepEqual(redistributeP0StoryboardDurations([4, 7, 4], 1, -1), [
      4, 6, 5,
    ]);
    assert.deepEqual(redistributeP0StoryboardDurations([4, 7, 4], 0, -2), [
      4, 7, 4,
    ]);
    assert.deepEqual(redistributeP0StoryboardDurations([5, 6, 4], 1, 4), [
      5, 6, 4,
    ]);
  });
});
