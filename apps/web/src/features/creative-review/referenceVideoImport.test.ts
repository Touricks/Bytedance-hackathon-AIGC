import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CREATIVE_REQUIREMENT_TEMPLATES,
  buildCreativeFactorRequirements
} from "@aigc-video/shared";
import {
  applyCreativeRequirementTemplate,
  promptRequirementsDataFromForm,
  requirementFormFromArtifact,
  syncCompiledRequirementFields
} from "./requirementsForm.js";

describe("reference video requirements import mapping", () => {
  it("maps imported artifact data into factor state and compiled requirement fields", () => {
    const data = buildCreativeFactorRequirements({
      productType: "offline-experience-service",
      audience: "youth",
      strategy: "review-comparison"
    });
    const form = requirementFormFromArtifact(data);

    assert.deepEqual(
      {
        imageStyle: form.imageStyle,
        imageComposition: form.imageComposition,
        imageAvoid: form.imageAvoid,
        scriptTone: form.scriptTone,
        storyboardRhythm: form.storyboardRhythm,
        shotImageGlobal: form.shotImageGlobal,
        shotVideoGlobal: form.shotVideoGlobal
      },
      {
        imageStyle:
          "真实展示目的地、交通、场地、服务人员和体验者。 保持商品/服务身份可识别。 视觉风格：UGC真实质感，自然光或窗边漫射光，曝光充足偏高，色彩干净通透，非广告棚感。",
        imageComposition:
          "按出发、到达、服务交付、核心体验和保障证明推进。 强调效率、颜值、实用价值和即时体验。",
        imageAvoid:
          "避免虚假场地、不存在的交通/酒店承诺和夸大安全保障。，避免虚假对比、过度制造焦虑和绝对化承诺。",
        scriptTone:
          "向年轻用户说服,语气直接、有体验感。 强调效率、颜值、实用价值和即时体验。 用可验证对比和适用人群建议完成转化。",
        storyboardRhythm:
          "按测评标准、使用过程、对比结果、适用建议和行动引导推进。 用可验证对比和适用人群建议完成转化。 按出发、到达、服务交付、核心体验和保障证明推进。 场景描写强调真实物理感，商品在自然生活场景中，人物极简（手部/局部优先）。",
        shotImageGlobal:
          "真实展示目的地、交通、场地、服务人员和体验者。 按出发、到达、服务交付、核心体验和保障证明推进。 视觉风格：UGC真实质感，自然光或窗边漫射光，曝光充足偏高，色彩干净通透，非广告棚感。",
        shotVideoGlobal:
          "用真实体验结论或前后差异开场,明确对比维度。 按出发、到达、服务交付、核心体验和保障证明推进。 运镜质感：镜头固定或轻微手持晃动，动作有物理重量感，无过度运镜，真实UGC节奏。"
      }
    );
    assert.deepEqual(form.creativeFactors, {
      productType: "offline-experience-service",
      audience: "youth",
      strategy: "review-comparison",
      visualStyle: "authentic"
    });
    assert.equal(
      form.factorGuidance.productType.subjectPresentation,
      "真实展示目的地、交通、场地、服务人员和体验者。"
    );
    assert.equal(
      form.scriptInfluence.strategy.openingPattern,
      "用真实体验结论或明确对比维度开场。"
    );
  });

  it("applies a setup template as a factor combination with source tags", () => {
    const template = CREATIVE_REQUIREMENT_TEMPLATES[0];
    assert.ok(template);
    const subjectPresentation =
      template.fields["factorGuidance.productType.subjectPresentation"];
    assert.ok(subjectPresentation);

    const form = applyCreativeRequirementTemplate(template);
    const data = promptRequirementsDataFromForm(form);

    assert.deepEqual(form.creativeFactors, template.creativeFactors);
    assert.deepEqual(form.creativeRequirementTemplate, {
      source: "setup-template",
      templateId: template.id,
      templateNameSnapshot: template.name,
      templateVersion: template.version,
      status: "applied"
    });
    assert.equal(
      form.factorGuidance.productType.subjectPresentation,
      subjectPresentation.value
    );
    assert.deepEqual(data.creativeRequirementTemplate, form.creativeRequirementTemplate);
    assert.deepEqual(
      data.compiledRequirementSourceMap?.imageStyle.map((source) => source.label),
      ["商品/服务类型:主体呈现"]
    );
  });

  it("keeps template source when customized fields are saved", () => {
    const template = CREATIVE_REQUIREMENT_TEMPLATES[0];
    assert.ok(template);
    const form = applyCreativeRequirementTemplate(template);
    const customized = syncCompiledRequirementFields({
      creativeFactors: form.creativeFactors,
      factorGuidance: {
        ...form.factorGuidance,
        productType: {
          ...form.factorGuidance.productType,
          subjectPresentation: "展示产品开封、近景质地和真实使用动作。"
        }
      },
      scriptInfluence: form.scriptInfluence,
      creativeRequirementTemplate: {
        ...form.creativeRequirementTemplate!,
        status: "customized"
      }
    });

    const data = promptRequirementsDataFromForm(customized);

    assert.equal(
      data.image?.style,
      "展示产品开封、近景质地和真实使用动作。 保持商品/服务身份可识别。 视觉风格：UGC真实质感，自然光或窗边漫射光，曝光充足偏高，色彩干净通透，非广告棚感。"
    );
    assert.equal(data.creativeRequirementTemplate?.status, "customized");
    assert.deepEqual(
      data.compiledRequirementSourceMap?.shotVideoGlobal.map((source) => source.label),
      ["推销手法:开场方式", "商品/服务类型:场景与交付"]
    );
  });

  it("updates compiled global prompt fields when editable strategy guidance changes", () => {
    const form = requirementFormFromArtifact(null);
    const customized = syncCompiledRequirementFields({
      creativeFactors: form.creativeFactors,
      factorGuidance: {
        ...form.factorGuidance,
        strategy: {
          ...form.factorGuidance.strategy,
          openingHook: "先用用户自定义的真实开场想法切入。"
        }
      },
      scriptInfluence: form.scriptInfluence,
      creativeRequirementTemplate: form.creativeRequirementTemplate
    });
    const data = promptRequirementsDataFromForm(customized);

    assert.equal(
      data.shotVideo?.global,
      "先用用户自定义的真实开场想法切入。 按需求场景、功能展示、细节证明和使用结果推进。 运镜质感：镜头固定或轻微手持晃动，动作有物理重量感，无过度运镜，真实UGC节奏。"
    );
  });
});
