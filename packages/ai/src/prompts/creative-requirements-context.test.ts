import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCreativeFactorRequirements } from "@aigc-video/shared";
import { formatCreativeRequirementsForModule } from "./creative-requirements-context.js";

const requirements = buildCreativeFactorRequirements({
  productType: "offline-experience-service",
  audience: "child",
  strategy: "scenario-demo",
});

describe("formatCreativeRequirementsForModule", () => {
  it("projects material intake context without script or storyboard instructions", () => {
    const text = formatCreativeRequirementsForModule(requirements, "material-intake");

    assert.ok(text);
    assert.match(text, /素材解读视图/);
    assert.match(text, /真实展示目的地、交通、场地、服务人员和体验者/);
    assert.match(text, /虚假场地/);
    assert.equal(text.includes("分镜结构："), false);
    assert.equal(text.includes("CTA 风格："), false);
  });

  it("projects product brief context around proof and benefit boundaries", () => {
    const text = formatCreativeRequirementsForModule(requirements, "product-brief");

    assert.ok(text);
    assert.match(text, /商品卖点视图/);
    assert.match(text, /线下体验服务不是可直接开箱的商品/);
    assert.match(text, /利益优先级：安全、省心、陪伴、成长体验/);
    assert.equal(text.includes("开场方式："), false);
  });

  it("projects storyboard context around structure and CTA", () => {
    const text = formatCreativeRequirementsForModule(requirements, "storyboard");

    assert.ok(text);
    assert.match(text, /分镜生成视图/);
    assert.match(text, /开场方式：用真实使用场景或操作瞬间开场/);
    assert.match(text, /CTA 风格：引导了解或下单/);
    assert.equal(text.includes("证明对象："), false);
  });

  it("keeps legacy seven fields for shotprompt and adds structured influence", () => {
    const text = formatCreativeRequirementsForModule(requirements, "shotprompt");

    assert.ok(text);
    assert.match(text, /已批准创作要求（导演约束）/);
    assert.match(text, /- 图像风格：/);
    assert.match(text, /结构化剧本影响/);
    assert.match(text, /受众称谓与语气：面向家长/);
  });

  it("formats neutral audience requirements as not limited to a specific group", () => {
    const neutral = buildCreativeFactorRequirements({
      productType: "durable-good",
      audience: "general",
      strategy: "visual-story",
    });

    assert.match(
      formatCreativeRequirementsForModule(neutral, "material-intake") ?? "",
      /目标人群：不限定特定人群/,
    );
    assert.match(
      formatCreativeRequirementsForModule(neutral, "product-brief") ?? "",
      /受众称谓：不限定特定人群/,
    );
    assert.match(
      formatCreativeRequirementsForModule(neutral, "shotprompt") ?? "",
      /受众称谓与语气：不限定特定人群/,
    );
  });

  it("treats deleted audience guidance fields as neutral targeting", () => {
    const neutral = buildCreativeFactorRequirements({
      productType: "durable-good",
      audience: "youth",
      strategy: "scenario-demo",
    });
    neutral.factorGuidance.audience = {
      addressingAndTone: "",
      benefitFrame: "",
      sensitivityBoundaries: "",
    };

    assert.match(
      formatCreativeRequirementsForModule(neutral, "product-brief") ?? "",
      /不限定特定人群/,
    );
    assert.doesNotMatch(
      formatCreativeRequirementsForModule(neutral, "shotprompt") ?? "",
      /年轻用户/,
    );
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
