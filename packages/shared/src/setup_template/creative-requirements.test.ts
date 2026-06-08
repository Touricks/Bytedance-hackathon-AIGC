import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CREATIVE_REQUIREMENT_TEMPLATES,
  type CreativeRequirementTemplate,
  filterCreativeRequirementTemplates,
  getCreativeRequirementTemplates,
} from "./creative-requirements.js";
import {
  applyCreativeFactorsToPromptRequirements,
  buildCreativeFactorRequirements,
  compileCreativeRequirementFields,
  creativeFactorRequirementsDataSchema,
  type FactorGuidance,
  type FactorGuidanceFieldPath,
} from "../schemas/creative-factors.js";

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
        "亲子旅游·家长向",
        "到店餐饮·青年",
        "本地摄影·青年",
      ],
    );
    assert.equal(
      templates[0]?.fields["factorGuidance.productType.subjectPresentation"]?.value,
      "真实展示包装开封、近景质地、单次用量和使用瞬间,让商品状态可感知。",
    );
    assert.deepEqual(
      templates[0]?.fields["factorGuidance.productType.subjectPresentation"]?.affects,
      ["image.style", "shotImage.global"],
    );
  });

  it("exposes a three-factor combination on every template", () => {
    const templates = getCreativeRequirementTemplates();
    for (const template of templates) {
      assert.equal(template.productType, template.creativeFactors.productType);
      assert.deepEqual(template.audiences, [template.creativeFactors.audience]);
      assert.equal(template.strategy, template.creativeFactors.strategy);
      assert.ok(template.version);
    }
  });

  it("keeps template values as a compiled compatibility cache", () => {
    const templates = getCreativeRequirementTemplates();
    for (const template of templates) {
      const base = buildCreativeFactorRequirements(template.creativeFactors);
      const factorGuidance = factorGuidanceFromTemplateFields(template, base.factorGuidance);
      const compiled = compileCreativeRequirementFields({
        factorGuidance,
        scriptInfluence: base.scriptInfluence,
        visualStyle: base.creativeFactors.visualStyle,
      });
      assert.deepEqual(template.values, {
        imageStyle: compiled.image.style,
        imageComposition: compiled.image.composition,
        imageAvoid: compiled.image.avoid.join("，"),
        scriptTone: compiled.script.tone,
        storyboardRhythm: compiled.storyboard.rhythm,
        shotImageGlobal: compiled.shotImage.global,
        shotVideoGlobal: compiled.shotVideo.global,
      });
    }
  });

  it("filters templates by product type and audience", () => {
    assert.deepEqual(
      filterCreativeRequirementTemplates({ audience: "youth" }).map((t) => t.id),
      [
        "consumable-youth-seeding",
        "durable-youth-showcase",
        "virtual-youth-conversion",
        "offline-youth-restaurant",
        "offline-youth-photography",
      ],
    );
    assert.deepEqual(
      filterCreativeRequirementTemplates({ productType: "consumable-good" }).map((t) => t.id),
      [
        "consumable-youth-seeding",
        "consumable-senior-health",
        "consumable-toddler-mombaby",
      ],
    );
    assert.deepEqual(
      filterCreativeRequirementTemplates({
        productType: "consumable-good",
        audience: "senior",
      }).map((t) => t.id),
      ["consumable-senior-health"],
    );
    assert.deepEqual(
      filterCreativeRequirementTemplates({
        productType: "digital-service",
        audience: "senior",
      }),
      [],
    );
    assert.deepEqual(
      filterCreativeRequirementTemplates({
        productType: "offline-experience-service",
        audience: "youth",
      }).map((t) => t.id),
      ["offline-youth-restaurant", "offline-youth-photography"],
    );
  });

  it("rejects templates with missing field influence declarations", () => {
    const template = firstTemplate();
    assert.throws(
      () =>
        getCreativeRequirementTemplates([
          {
            ...template,
            fields: {},
          },
        ]),
      /required|Invalid/,
    );
  });

  it("rejects templates with an invalid product type", () => {
    const template = firstTemplate();
    assert.throws(
      () =>
        getCreativeRequirementTemplates([
          {
            ...template,
            creativeFactors: {
              ...template.creativeFactors,
              productType: "service",
            },
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

  it("rejects template fields whose affects drift from the canonical mapping", () => {
    const template = firstTemplate();
    assert.throws(
      () =>
        getCreativeRequirementTemplates([
          {
            ...template,
            fields: {
              ...template.fields,
              "factorGuidance.productType.subjectPresentation": {
                ...template.fields["factorGuidance.productType.subjectPresentation"],
                affects: ["script.tone"],
              },
            },
          },
        ]),
      /affects must match canonical/,
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

  it("builds editable factor guidance and script influence from three factors", () => {
    const data = buildCreativeFactorRequirements({
      productType: "offline-experience-service",
      audience: "child",
      strategy: "scenario-demo",
    });

    assert.deepEqual(data.creativeFactors, {
      productType: "offline-experience-service",
      audience: "child",
      strategy: "scenario-demo",
      visualStyle: "authentic",
    });
    assert.equal(
      data.factorGuidance.productType.subjectPresentation,
      "真实展示目的地、交通、场地、服务人员和体验者。",
    );
    assert.deepEqual(data.scriptInfluence.audience.benefitPriority, [
      "安全",
      "省心",
      "陪伴",
      "成长体验",
    ]);
    assert.ok(String(data.storyboard.rhythm).includes("场景进入"));
    assert.deepEqual(data.compiledRequirementSourceMap.imageStyle.map((source) => source.label), [
      "商品/服务类型:主体呈现",
    ]);
    assert.deepEqual(
      data.compiledRequirementSourceMap.storyboardRhythm.map((source) => source.label),
      ["推销手法:故事结构", "推销手法:证据与行动引导", "商品/服务类型:场景与交付"],
    );
  });

  it("compiles requirement fields with source maps for user-facing explanations", () => {
    const data = buildCreativeFactorRequirements({
      productType: "offline-experience-service",
      audience: "child",
      strategy: "scenario-demo",
    });
    const compiled = compileCreativeRequirementFields(data);

    assert.equal(
      compiled.image.style,
      "真实展示目的地、交通、场地、服务人员和体验者。 保持商品/服务身份可识别。 视觉风格：UGC真实质感，自然光或窗边漫射光，曝光充足偏高，色彩干净通透，非广告棚感。",
    );
    assert.deepEqual(
      compiled.compiledRequirementSourceMap.shotVideoGlobal.map((source) => source.affects),
      [["shotVideo.global"], ["image.composition", "storyboard.rhythm", "shotImage.global", "shotVideo.global"]],
    );
  });

  it("uses editable opening hook guidance in shot video global requirements", () => {
    const data = buildCreativeFactorRequirements({
      productType: "durable-good",
      audience: "youth",
      strategy: "scenario-demo",
    });
    const compiled = compileCreativeRequirementFields({
      factorGuidance: {
        ...data.factorGuidance,
        strategy: {
          ...data.factorGuidance.strategy,
          openingHook: "先用用户自己的真实开场想法切入。",
        },
      },
      scriptInfluence: data.scriptInfluence,
      visualStyle: data.creativeFactors.visualStyle,
    });

    assert.equal(
      compiled.shotVideo.global,
      "先用用户自己的真实开场想法切入。 按需求场景、功能展示、细节证明和使用结果推进。 运镜质感：镜头固定或轻微手持晃动，动作有物理重量感，无过度运镜，真实UGC节奏。",
    );
  });

  it("builds neutral requirements when audience is not limited", () => {
    const data = buildCreativeFactorRequirements({
      productType: "durable-good",
      audience: "general",
      strategy: "visual-story",
    });

    assert.deepEqual(data.creativeFactors, {
      productType: "durable-good",
      audience: "general",
      strategy: "visual-story",
      visualStyle: "authentic",
    });
    assert.match(
      data.factorGuidance.audience.addressingAndTone,
      /面向广泛用户/,
    );
    assert.match(String(data.shotVideo.global), /产品本身的视觉质感/);
    assert.match(String(data.storyboard.rhythm), /质感开场/);
  });

  it("accepts deleted audience guidance fields without losing the artifact shape", () => {
    const data = buildCreativeFactorRequirements({
      productType: "durable-good",
      audience: "general",
      strategy: "visual-story",
    });
    const parsed = buildCreativeFactorRequirements(data.creativeFactors);
    parsed.factorGuidance.audience = {
      addressingAndTone: "",
      benefitFrame: "",
      sensitivityBoundaries: "",
    };

    assert.doesNotThrow(() => creativeFactorRequirementsDataSchema.parse(parsed));
  });

  it("routes every editable factor guidance field into its declared compiled fields", () => {
    const data = buildCreativeFactorRequirements({
      productType: "durable-good",
      audience: "youth",
      strategy: "scenario-demo",
    });
    const compiled = compileCreativeRequirementFields({
      factorGuidance: {
        productType: {
          subjectPresentation: "主体呈现自定义。",
          sceneAndDelivery: "场景交付自定义。",
          authenticityBoundaries: "真实性边界自定义。",
        },
        audience: {
          addressingAndTone: "称谓语气自定义。",
          benefitFrame: "利益表达自定义。",
          sensitivityBoundaries: "敏感边界自定义。",
        },
        strategy: {
          openingHook: "开场方式自定义。",
          storyStructure: "故事结构自定义。",
          evidenceAndCta: "证据行动自定义。",
        },
      },
      scriptInfluence: data.scriptInfluence,
      visualStyle: data.creativeFactors.visualStyle,
    });
    const fields = {
      imageStyle: String(compiled.image.style),
      imageComposition: String(compiled.image.composition),
      imageAvoid: compiled.image.avoid.join("，"),
      scriptTone: String(compiled.script.tone),
      storyboardRhythm: String(compiled.storyboard.rhythm),
      shotImageGlobal: String(compiled.shotImage.global),
      shotVideoGlobal: String(compiled.shotVideo.global),
    };

    assert.match(fields.imageStyle, /主体呈现自定义/);
    assert.match(fields.shotImageGlobal, /主体呈现自定义/);
    assert.match(fields.imageComposition, /场景交付自定义/);
    assert.match(fields.storyboardRhythm, /场景交付自定义/);
    assert.match(fields.shotImageGlobal, /场景交付自定义/);
    assert.match(fields.shotVideoGlobal, /场景交付自定义/);
    assert.match(fields.imageAvoid, /真实性边界自定义/);
    assert.match(fields.scriptTone, /称谓语气自定义/);
    assert.match(fields.imageComposition, /利益表达自定义/);
    assert.match(fields.scriptTone, /利益表达自定义/);
    assert.match(fields.imageAvoid, /敏感边界自定义/);
    assert.match(fields.shotVideoGlobal, /开场方式自定义/);
    assert.match(fields.storyboardRhythm, /故事结构自定义/);
    assert.match(fields.scriptTone, /证据行动自定义/);
    assert.match(fields.storyboardRhythm, /证据行动自定义/);
  });

  it("merges a reference video draft with compiled creative factors", () => {
    const data = applyCreativeFactorsToPromptRequirements(
      {
        image: { style: "参考视频的真实视觉风格" },
        script: { structure: "参考视频的结构" },
      },
      {
        productType: "durable-good",
        audience: "youth",
        strategy: "scenario-demo",
      },
    );

    assert.equal(data.image.style, "参考视频的真实视觉风格");
    assert.equal(data.script.structure, "参考视频的结构");
    assert.equal(
      data.factorGuidance.productType.subjectPresentation,
      "真实展示商品主体、关键功能部位、使用场景和必要配件。",
    );
    assert.equal(
      data.scriptInfluence.strategy.openingPattern,
      "用真实使用场景或操作瞬间开场,快速说明商品如何解决问题。",
    );
  });
});

function factorGuidanceFromTemplateFields(
  template: CreativeRequirementTemplate,
  fallback: FactorGuidance,
): FactorGuidance {
  const next: FactorGuidance = {
    productType: { ...fallback.productType },
    audience: { ...fallback.audience },
    strategy: { ...fallback.strategy },
  };
  for (const [path, field] of Object.entries(template.fields)) {
    const [, group, key] = path.split(".") as [
      "factorGuidance",
      keyof FactorGuidance,
      string,
    ];
    (next[group] as Record<string, string>)[key] = field.value;
    assert.ok((path as FactorGuidanceFieldPath).startsWith("factorGuidance."));
  }
  return next;
}
