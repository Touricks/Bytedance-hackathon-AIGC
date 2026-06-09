import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIENCE_GUIDANCE,
  DEAL_TYPE_GUIDANCE,
  FACTOR_PROMPT_VERSION,
  PRODUCT_CATEGORY_GUIDANCE,
  STRATEGY_GUIDANCE,
  DEFAULT_CREATIVE_FACTORS,
  applyCreativeFactorsToPromptRequirements,
  buildCreativeFactorRequirements,
  compileCreativeRequirementFields,
  creativeFactorsSchema,
  productCategorySchema,
  dealTypeSchema,
  audienceSchema,
  strategySchema,
} from "../schemas/creative-factors.js";
import {
  CREATIVE_REQUIREMENT_TEMPLATES,
  filterCreativeRequirementTemplates,
  getCreativeRequirementTemplates,
} from "./creative-requirements.js";

describe("four-factor creative requirement compiler", () => {
  it("keeps every canonical catalog complete and non-empty", () => {
    assert.equal(Object.keys(PRODUCT_CATEGORY_GUIDANCE).length, productCategorySchema.options.length);
    assert.equal(Object.keys(DEAL_TYPE_GUIDANCE).length, dealTypeSchema.options.length);
    assert.equal(Object.keys(AUDIENCE_GUIDANCE).length, audienceSchema.options.length);
    assert.equal(Object.keys(STRATEGY_GUIDANCE).length, strategySchema.options.length);

    for (const pack of [
      ...Object.values(PRODUCT_CATEGORY_GUIDANCE),
      ...Object.values(DEAL_TYPE_GUIDANCE),
      ...Object.values(AUDIENCE_GUIDANCE),
      ...Object.values(STRATEGY_GUIDANCE),
    ]) {
      for (const value of Object.values(pack)) {
        if (Array.isArray(value)) {
          assert.ok(value.length > 0);
          assert.ok(value.every((item) => item.trim().length > 0));
        } else {
          assert.ok(String(value).trim().length > 0);
        }
      }
    }
  });

  it("accepts 不限定 (general) on every creative factor and compiles guidance", () => {
    const generalFactors = creativeFactorsSchema.parse({
      productCategory: "general",
      dealType: "general",
      audience: "general",
      strategy: "general",
    });
    assert.deepEqual(generalFactors, {
      productCategory: "general",
      dealType: "general",
      audience: "general",
      strategy: "general",
    });

    const requirements = buildCreativeFactorRequirements(generalFactors);
    assert.equal(requirements.factorComboKey, "general__general__general__general");
    assert.ok(requirements.factorGuidance.productCategory.requiredVisualElements.length > 0);
    assert.ok(requirements.factorGuidance.dealType.purchaseTask.length > 0);
    assert.ok(requirements.factorGuidance.strategy.hookMechanism.length > 0);
    assert.equal(DEFAULT_CREATIVE_FACTORS.productCategory, "general");
    assert.equal(DEFAULT_CREATIVE_FACTORS.dealType, "general");
    assert.equal(DEFAULT_CREATIVE_FACTORS.audience, "general");
    assert.equal(DEFAULT_CREATIVE_FACTORS.strategy, "general");
  });

  it("rejects old three-factor productType payloads", () => {
    assert.throws(
      () =>
        creativeFactorsSchema.parse({
          productType: "durable-good",
          audience: "youth",
          strategy: "scenario-demo",
        }),
      /productCategory/,
    );
  });

  it("accepts productCategory as a canonical creative factor", () => {
    assert.deepEqual(
      creativeFactorsSchema.parse({
        productCategory: "consumer-electronics",
        dealType: "search-standard",
        audience: "youth",
        strategy: "review-comparison",
      }),
      {
        productCategory: "consumer-electronics",
        dealType: "search-standard",
        audience: "youth",
        strategy: "review-comparison",
      },
    );
    assert.equal("productCategory" in DEFAULT_CREATIVE_FACTORS, true);
  });

  it("rejects non-attribution visualStyle payloads", () => {
    assert.throws(
      () =>
        creativeFactorsSchema.parse({
          dealType: "search-standard",
          audience: "youth",
          strategy: "review-comparison",
          visualStyle: "authentic",
        }),
      /visualStyle/,
    );
  });

  it("compiles the same four factors and version deterministically", () => {
    const factors = {
      productCategory: "consumer-electronics",
      dealType: "search-standard",
      audience: "youth",
      strategy: "review-comparison",
    } as const;
    const first = buildCreativeFactorRequirements(factors);
    const second = buildCreativeFactorRequirements(factors);

    assert.equal(first.factorPromptVersion, FACTOR_PROMPT_VERSION);
    assert.equal(second.factorPromptVersion, FACTOR_PROMPT_VERSION);
    assert.equal(first.factorComboKey, second.factorComboKey);
    assert.equal(first.compiledRequirementsHash, second.compiledRequirementsHash);
    assert.deepEqual(first.image, second.image);
    assert.deepEqual(first.script, second.script);
    assert.deepEqual(first.storyboard, second.storyboard);
    assert.deepEqual(first.shotImage, second.shotImage);
    assert.deepEqual(first.shotVideo, second.shotVideo);
  });

  it("changes hash when factorPromptVersion changes", () => {
    const requirements = buildCreativeFactorRequirements();
    const next = compileCreativeRequirementFields({
      creativeFactors: requirements.creativeFactors,
      factorGuidance: requirements.factorGuidance,
      factorPromptVersion: "factor-prompt.next",
    });

    assert.equal(next.factorComboKey, requirements.factorComboKey);
    assert.notEqual(next.compiledRequirementsHash, requirements.compiledRequirementsHash);
  });

  it("does not let reference video drafts override factor-derived global prompts", () => {
    const data = applyCreativeFactorsToPromptRequirements(
      {
        image: { style: ["参考视频风格"] },
        script: { tone: ["参考视频语气"] },
      },
      {
        productCategory: "consumer-electronics",
        dealType: "search-standard",
        audience: "youth",
        strategy: "review-comparison",
      },
    );

    assert.notDeepEqual(data.image.style, ["参考视频风格"]);
    assert.match(data.factorComboKey, /^consumer-electronics__search-standard__/);
  });
});

describe("factor presets", () => {
  it("validates built-in factor presets", () => {
    const templates = getCreativeRequirementTemplates();

    assert.deepEqual(
      templates.map((template) => template.name),
      [
        "3C数码·搜索标品",
        "美妆个护·青年种草",
        "食品饮料·爆款钩子",
        "母婴宠物·复购痛点",
        "珠宝文玩·礼赠",
      ],
    );
    for (const template of templates) {
      assert.ok(template.version.startsWith("factor-preset."));
      assert.equal("productCategory" in template.creativeFactors, true);
      assert.equal("fields" in template, false);
      assert.equal("values" in template, false);
    }
  });

  it("filters presets by the new four-factor dimensions", () => {
    assert.deepEqual(
      filterCreativeRequirementTemplates({ audience: "youth" }).map((template) => template.id),
      [
        "consumer-electronics-search-youth-review",
        "beauty-seeding-youth-scenario",
      ],
    );
    assert.deepEqual(
      filterCreativeRequirementTemplates({
        productCategory: "consumer-electronics",
        dealType: "search-standard",
      }).map((template) => template.id),
      ["consumer-electronics-search-youth-review"],
    );
  });

  it("rejects duplicate preset ids", () => {
    const template = CREATIVE_REQUIREMENT_TEMPLATES[0];
    assert.ok(template);
    assert.throws(
      () => getCreativeRequirementTemplates([template, template]),
      /Duplicate creative requirement preset id/,
    );
  });
});
