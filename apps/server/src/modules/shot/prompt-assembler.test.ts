import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSeedanceShotVideoPrompt } from "../generation/direct-generation.js";
import {
  assembleShotImagePrompt,
  assembleShotVideoScript,
} from "./prompt-assembler.js";

describe("shot prompt deterministic assemblers", () => {
  it("assembles image prompt with shot goal first, shotImage requirements second, and feedback", () => {
    const assembled = assembleShotImagePrompt({
      shotGoal: "作为钩子镜头，快速呈现空白墙面的痛点。",
      shotImage: {
        scene: "现代简约家居室内空白墙面场景",
        composition: "全景构图，墙面居中",
        lighting: "柔和自然室内漫射光",
        productVisibility: "装饰画完整出现在画面中央",
        referenceUsage: "使用素材 DSC04745.JPG 保持装饰画内容",
        negative: "不要出现多余杂物",
      },
      userDirection: "入口标识更清晰，背景不要变",
      mode: "regenerate",
    });

    assert.ok(assembled.promptText.startsWith("[镜头目标]\n作为钩子镜头"));
    assert.match(assembled.promptText, /\[分镜图要求\]/);
    assert.match(assembled.promptText, /scene: 现代简约家居室内空白墙面场景/);
    assert.match(assembled.promptText, /\[本轮反馈\]/);
    assert.match(assembled.promptText, /入口标识更清晰，背景不要变/);
    assert.match(assembled.promptText, /第一优先级：被反馈的候选分镜图/);
    assert.equal(assembled.negativePrompt, "不要出现多余杂物");
  });

  it("assembles final Seedance prompt with shot goal context, frames, voiceover, and audio-only narration rule", () => {
    const assembled = assembleShotVideoScript({
      shotGoal: "作为卖点证明镜头，展示墙面从空白到有装饰画的视觉提升。",
      shotVideo: {
        cameraMotion: "镜头缓慢推进",
        subjectMotion: "墙面和装饰画保持稳定",
        firstFrameIntent: "从已选空白墙面开始",
        lastFrameIntent: "自然接近下一镜装饰画全景",
        continuity: "保持同一室内空间",
        negative: "不要突然拉远",
      },
      durationSec: 4,
      voiceover: "家里墙面光秃秃没氛围？",
      voiceProfile: {
        gender: "female",
        tone: "亲切、自然",
        pitch: "medium",
        pace: "medium",
      },
      firstFrameCandidateId: "imc_first",
      firstFrameUrl: "https://cdn.example/first.png",
      lastFrameCandidateId: "imc_last",
      lastFrameUrl: "https://cdn.example/last.png",
      userDirection: "镜头慢一点，不要突然拉远",
      feedbackVideoCandidateId: "vcd_feedback",
      mode: "regenerate",
    });
    const prompt = buildSeedanceShotVideoPrompt({
      providerPrompt: assembled.providerPrompt,
      scriptJson: assembled.scriptJson,
    });

    assert.match(prompt, /\[镜头目标上下文\]/);
    assert.match(prompt, /作为卖点证明镜头/);
    assert.match(prompt, /\[分镜视频要求\]/);
    assert.match(prompt, /首帧：必须贴合当前分镜已选图 imc_first/);
    assert.match(prompt, /尾帧：自然接近下一分镜已选图 imc_last/);
    assert.match(prompt, /反馈对象：最新轮次候选视频 vcd_feedback/);
    assert.match(prompt, /generate_audio=true/);
    assert.match(prompt, /口播文案：“家里墙面光秃秃没氛围？”/);
    assert.match(prompt, /禁止将口播文案、旁白文字或其改写复制、叠加、渲染到视频画面内/);
  });
});
