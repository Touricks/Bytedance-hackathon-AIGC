import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyChip, matchPreset, resolveAssistantReply } from "./assistantReply.js";
import { getDashboardAnalyticsSnapshot } from "./dashboardDataApi.js";

const presets = getDashboardAnalyticsSnapshot().assistantPresets;

describe("classifyChip", () => {
  it("routes matrix / channel-compare chips to a panel scroll, others to send", () => {
    assert.equal(classifyChip("看推销手法×渠道矩阵"), "scroll-matrix");
    assert.equal(classifyChip("看渠道对比"), "scroll-channel");
    assert.equal(classifyChip("哪种推销手法 ROAS 最高？"), "send");
  });
});

describe("matchPreset", () => {
  it("matches by exact question", () => {
    assert.equal(matchPreset(presets, "哪种推销手法 ROAS 最高？")?.question, "哪种推销手法 ROAS 最高？");
  });

  it("matches by keyword heuristics", () => {
    assert.equal(
      matchPreset(presets, "这条要不要换个手法")?.question,
      "这条视频该换什么推销手法？",
    );
    assert.equal(
      matchPreset(presets, "痛点解决放哪个渠道")?.question,
      "痛点解决在哪个渠道最好？",
    );
  });

  it("returns undefined when nothing matches", () => {
    assert.equal(matchPreset(presets, "今天天气怎么样"), undefined);
  });
});

describe("resolveAssistantReply", () => {
  it("returns the preset answer + chips when matched", () => {
    const reply = resolveAssistantReply(presets, "哪种推销手法 ROAS 最高？");
    assert.match(reply.text, /5\.40/);
    assert.ok(reply.chips.length > 0);
  });

  it("falls back to a generic prompt with preset questions as chips", () => {
    const reply = resolveAssistantReply(presets, "无关问题");
    assert.match(reply.text, /推销手法表现/);
    assert.deepEqual(reply.chips, presets.map((preset) => preset.question).slice(0, 3));
  });
});
