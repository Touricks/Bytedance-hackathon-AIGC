import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCreativeFactorRequirements } from "@aigc-video/shared";
import { formatCreativeRequirementsForModule } from "./creative-requirements-context.js";

const requirements = buildCreativeFactorRequirements({
  productCategory: "consumer-electronics",
  dealType: "search-standard",
  audience: "youth",
  strategy: "review-comparison",
});

describe("formatCreativeRequirementsForModule", () => {
  it("projects material intake context without script or storyboard instructions", () => {
    const text = formatCreativeRequirementsForModule(requirements, "material-intake");

    assert.ok(text);
    assert.match(text, /素材解读视图/);
    assert.match(text, /【商品一级类目】/);
    assert.match(text, /设备本体/);
    assert.match(text, /桌面办公/);
    assert.equal(text.includes("叙事结构："), false);
  });

  it("projects product brief context around proof and benefit boundaries", () => {
    const text = formatCreativeRequirementsForModule(requirements, "product-brief");

    assert.ok(text);
    assert.match(text, /商品卖点视图/);
    assert.match(text, /【商品成交类型】/);
    assert.match(text, /用户已有明确需求/);
    assert.match(text, /规格维度/);
    assert.match(text, /不做收入羞辱/);
    assert.equal(text.includes("开场机制："), false);
  });

  it("projects storyboard context around structure and evidence order", () => {
    const text = formatCreativeRequirementsForModule(requirements, "storyboard");

    assert.ok(text);
    assert.match(text, /分镜生成视图/);
    assert.match(text, /【推销手法】/);
    assert.match(text, /review-comparison/);
    assert.match(text, /对比标准/);
    assert.equal(text.includes("决策信息维度："), false);
  });

  it("groups shotprompt guidance by source and maps channels without attribution metadata", () => {
    const text = formatCreativeRequirementsForModule(requirements, "shotprompt");

    assert.ok(text);
    assert.match(text, /已批准创作要求（导演约束）/);
    assert.match(text, /【商品一级类目】/);
    assert.match(text, /通道映射：/);
    assert.match(text, /图像风格←/);
    assert.equal(text.includes("结构化归因信息"), false);
    assert.equal(text.includes("factorPromptVersion"), false);
    assert.equal(text.includes("compiledRequirementsHash"), false);
  });

  it("falls back to legacy requirements only for shotprompt", () => {
    const legacy = {
      image: { style: "真实商品摄影" },
      script: { tone: "直接可信" },
      storyboard: { rhythm: "开场快" },
      shotImage: { global: "画面连续" },
      shotVideo: { global: "镜头平滑" },
    };

    assert.equal(formatCreativeRequirementsForModule(legacy, "material-intake"), null);
    assert.match(
      formatCreativeRequirementsForModule(legacy, "shotprompt") ?? "",
      /图像风格：真实商品摄影/,
    );
  });
});
