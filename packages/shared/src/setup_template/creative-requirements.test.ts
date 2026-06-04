import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CREATIVE_REQUIREMENT_TEMPLATES,
  type CreativeRequirementTemplate,
  filterCreativeRequirementTemplates,
  getCreativeRequirementTemplates,
} from "./creative-requirements.js";

function firstTemplate(): CreativeRequirementTemplate {
  const template = CREATIVE_REQUIREMENT_TEMPLATES[0];
  assert.ok(template);
  return template;
}

describe("creative requirement setup templates", () => {
  it("validates the built-in creative requirement templates", () => {
    const templates = getCreativeRequirementTemplates();

    assert.deepEqual(
      templates.map((template) => template.name),
      [
        "快消种草·青年",
        "数码家居·青年",
        "知识服务·青年",
        "银发滋补·老年",
        "儿童好物·家长向",
        "母婴用品·幼儿",
      ],
    );
    assert.equal(
      templates[0]?.values.imageStyle,
      "真实生活感种草质感，保留商品包装、质地和使用瞬间的真实细节",
    );
  });

  it("exposes product type and audience classification on every template", () => {
    const templates = getCreativeRequirementTemplates();
    for (const template of templates) {
      assert.ok(["virtual-service", "consumable", "durable"].includes(template.productType));
      assert.ok(template.audiences.length >= 1);
    }
  });

  it("filters templates by product type and audience", () => {
    assert.deepEqual(
      filterCreativeRequirementTemplates({ audience: "youth" }).map((t) => t.id),
      ["consumable-youth-seeding", "durable-youth-showcase", "virtual-youth-conversion"],
    );
    assert.deepEqual(
      filterCreativeRequirementTemplates({ productType: "consumable" }).map((t) => t.id),
      [
        "consumable-youth-seeding",
        "consumable-senior-health",
        "consumable-toddler-mombaby",
      ],
    );
    assert.deepEqual(
      filterCreativeRequirementTemplates({
        productType: "consumable",
        audience: "senior",
      }).map((t) => t.id),
      ["consumable-senior-health"],
    );
    assert.deepEqual(
      filterCreativeRequirementTemplates({
        productType: "virtual-service",
        audience: "senior",
      }),
      [],
    );
  });

  it("rejects templates with missing required fields", () => {
    const template = firstTemplate();
    assert.throws(
      () =>
        getCreativeRequirementTemplates([
          {
            ...template,
            values: {
              ...template.values,
              shotVideoGlobal: undefined,
            },
          },
        ]),
      /Required/,
    );
  });

  it("rejects templates with an invalid product type", () => {
    const template = firstTemplate();
    assert.throws(
      () =>
        getCreativeRequirementTemplates([
          {
            ...template,
            productType: "service",
          },
        ]),
      /Invalid enum value/,
    );
  });

  it("rejects templates with an empty audience list", () => {
    const template = firstTemplate();
    assert.throws(
      () =>
        getCreativeRequirementTemplates([
          {
            ...template,
            audiences: [],
          },
        ]),
      /at least 1 element/,
    );
  });

  it("rejects templates with blank text values", () => {
    const template = firstTemplate();
    assert.throws(
      () =>
        getCreativeRequirementTemplates([
          {
            ...template,
            summary: " ",
          },
        ]),
      /String must contain at least 1 character/,
    );
  });

  it("rejects duplicate template ids", () => {
    const template = firstTemplate();
    assert.throws(
      () => getCreativeRequirementTemplates([template, template]),
      /Duplicate creative requirement template id/,
    );
  });
});