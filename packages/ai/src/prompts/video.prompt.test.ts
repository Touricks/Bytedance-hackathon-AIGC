import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTwelveSecondVideoPrompt } from "./video.prompt.js";

describe("buildTwelveSecondVideoPrompt", () => {
  it("builds the conservative V0 whole-video prompt from a creative blueprint", () => {
    const prompt = buildTwelveSecondVideoPrompt({
      narrative: "Open with product trust, show the benefit, close with a hero shot.",
      visualStyle: "clean premium ecommerce",
      targetAudience: "busy office workers",
      coreSellingPoint: "USB-C charging",
      shots: [
        {
          index: 1,
          durationSec: 3,
          purpose: "hook",
          visualPrompt: "Clean hero shot of the blender",
          cameraMotion: "slow push in",
          voiceover: "Meet the portable blender.",
          subtitle: "Blend anywhere"
        },
        {
          index: 2,
          durationSec: 5,
          purpose: "benefit",
          visualPrompt: "Detail shot showing USB-C charging",
          cameraMotion: "smooth pan",
          voiceover: "Charge fast.",
          subtitle: "USB-C charging"
        }
      ],
      renderBrief: {
        productConsistencyRules: ["Keep shape and color consistent"],
        avoid: ["Do not invent brand text"],
        videoPromptSummary: "Clean blender showcase"
      },
      improvementHints: [
        {
          ifVideoLooksBad: "商品不像原图",
          suggestedUserAction: "上传更清晰的商品图。",
          fieldsToChange: ["productImage"]
        }
      ]
    });

    assert.match(prompt, /based on the provided product image as the source of truth/);
    assert.match(prompt, /0-3s: clean hero shot/);
    assert.match(prompt, /3-8s: simple use-context or detail close-up/);
    assert.match(prompt, /8-12s: return to a polished product hero shot/);
    assert.match(prompt, /USB-C charging/);
    assert.match(prompt, /Do not invent new product parts/);
    assert.doesNotMatch(prompt, /subtitle:/i);
  });
});
