import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSeedanceShotVideoPrompt } from "./direct-generation.js";
import {
  buildSeedanceVoiceProfilePrompt,
  seedanceVoiceProfileHash,
} from "./voice-profile.js";

describe("Seedance voice profile", () => {
  it("builds a deterministic narration profile from shotprompt tts settings", () => {
    const profile = {
      gender: "male",
      tone: "沉稳、克制、可信",
      pitch: "low",
      pace: "slow",
    };

    const prompt = buildSeedanceVoiceProfilePrompt(profile);

    assert.match(prompt, /男声/);
    assert.match(prompt, /沉稳、克制、可信/);
    assert.match(prompt, /低沉/);
    assert.match(prompt, /慢速/);
    assert.notEqual(seedanceVoiceProfileHash(profile), seedanceVoiceProfileHash());
  });

  it("injects the approved voice profile into the final per-shot Seedance prompt", () => {
    const prompt = buildSeedanceShotVideoPrompt({
      providerPrompt: "镜头缓慢推进商品，保持商品清晰。",
      scriptJson: {
        voiceover: "现在入手更划算",
        context: {
          voiceProfile: {
            gender: "male",
            tone: "沉稳、克制、可信",
            pitch: "low",
            pace: "slow",
          },
        },
      },
    });

    assert.match(prompt, /generate_audio=true/);
    assert.match(prompt, /男声/);
    assert.match(prompt, /沉稳、克制、可信/);
    assert.match(prompt, /低沉/);
    assert.match(prompt, /慢速/);
    assert.match(prompt, /口播文案：“现在入手更划算”/);
    assert.match(prompt, /禁止将口播文案、旁白文字或其改写复制、叠加、渲染到视频画面内/);
  });
});
