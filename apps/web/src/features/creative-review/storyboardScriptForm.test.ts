import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STORYBOARD_SCRIPT_DEFAULT_DURATIONS,
  STORYBOARD_SCRIPT_DEFAULT_PURPOSES,
  STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
  storyboardScriptVoiceoverCount,
  storyboardScriptVoiceoverLimit,
  type StoryboardArtifact,
} from "@aigc-video/shared";
import {
  applyStoryboardDurationAllocation,
  fitStoryboardVoiceoversToBudget,
  formToStoryboard,
  storyboardToForm,
} from "./CreativeReviewDesk.js";

function shot(
  index: number,
  overrides: Partial<StoryboardArtifact["shots"][number]> = {},
): StoryboardArtifact["shots"][number] {
  return {
    index,
    purpose: "benefit",
    durationSec: 4,
    scene: `场景 ${index}`,
    visualDirection: `画面 ${index}`,
    productAssetRef: "DSC04100.JPG",
    voiceover: `口播 ${index}`,
    transition: "硬切",
    ...overrides,
  };
}

describe("storyboard script form mapping", () => {
  it("normalizes legacy multi-shot storyboard drafts to the P0 three-shot default", () => {
    const legacy: StoryboardArtifact = {
      narrative: "钩子 -> 卖点 -> 证明 -> CTA",
      totalDurationSec: 14,
      assumptions: ["旧版四镜"],
      shots: [
        shot(0, { purpose: "hook", durationSec: 3, voiceover: "开场" }),
        shot(1, { durationSec: 4, scene: "卖点 A", voiceover: "卖点 A 口播" }),
        shot(2, { durationSec: 4, scene: "证明 B", voiceover: "证明 B 口播" }),
        shot(3, { purpose: "cta", durationSec: 3, voiceover: "行动号召" }),
      ],
    };

    const form = storyboardToForm(legacy);

    assert.equal(form.totalDurationSec, String(STORYBOARD_SCRIPT_TOTAL_DURATION_SEC));
    assert.deepEqual(
      form.shots.map((item) => item.durationSec),
      STORYBOARD_SCRIPT_DEFAULT_DURATIONS.map(String),
    );
    assert.deepEqual(
      form.shots.map((item) => item.purpose),
      STORYBOARD_SCRIPT_DEFAULT_PURPOSES,
    );
    assert.equal(form.shots[1]?.scene, "卖点 A；证明 B");
    assert.equal(form.shots[1]?.voiceover, "卖点 A 口播；证明 B 口播");

    const draft = formToStoryboard(form, legacy);
    assert.equal(draft.totalDurationSec, STORYBOARD_SCRIPT_TOTAL_DURATION_SEC);
    assert.equal(draft.shots.length, 3);
    assert.deepEqual(
      draft.shots.map((item) => item.index),
      [0, 1, 2],
    );
    assert.deepEqual(
      draft.shots.map((item) => item.durationSec),
      STORYBOARD_SCRIPT_DEFAULT_DURATIONS,
    );
  });

  it("fits generated voiceover copy to the per-shot duration budget", () => {
    const source: StoryboardArtifact = {
      narrative: "钩子 -> 证明 -> CTA",
      totalDurationSec: STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
      assumptions: [],
      shots: [
        shot(0, {
          purpose: "hook",
          durationSec: 4,
          voiceover: "这是一段明显超过四秒钟预算的超长开场口播文案",
        }),
        shot(1, {
          purpose: "proof",
          durationSec: 7,
          voiceover:
            "这是一段明显超过七秒钟预算的证明段口播文案，包含多个卖点和证明细节",
        }),
        shot(2, {
          purpose: "cta",
          durationSec: 4,
          voiceover: "这是一段明显超过四秒钟预算的行动号召口播文案",
        }),
      ],
    };

    const fitted = fitStoryboardVoiceoversToBudget(storyboardToForm(source));

    for (const item of fitted.shots) {
      const durationSec = Number(item.durationSec);
      assert.ok(
        storyboardScriptVoiceoverCount(item.voiceover) <=
          storyboardScriptVoiceoverLimit(durationSec),
      );
    }
  });

  it("applies timeline duration allocation without changing shot count or total", () => {
    const source: StoryboardArtifact = {
      narrative: "钩子 -> 证明 -> CTA",
      totalDurationSec: STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
      assumptions: [],
      shots: [
        shot(0, { purpose: "hook", durationSec: 4 }),
        shot(1, { purpose: "proof", durationSec: 7 }),
        shot(2, { purpose: "cta", durationSec: 4 }),
      ],
    };
    const form = storyboardToForm(source);

    const allocated = applyStoryboardDurationAllocation(form, [5, 6, 4]);
    const draft = formToStoryboard(allocated, source);

    assert.deepEqual(
      allocated.shots.map((item) => item.durationSec),
      ["5", "6", "4"],
    );
    assert.equal(draft.shots.length, 3);
    assert.equal(draft.totalDurationSec, STORYBOARD_SCRIPT_TOTAL_DURATION_SEC);
    assert.equal(
      draft.shots.reduce((sum, item) => sum + item.durationSec, 0),
      STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
    );
  });
});
