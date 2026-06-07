import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREATIVE_REQUIREMENT_TEMPLATES } from "@aigc-video/shared";
import {
  applyCreativeRequirementTemplate,
  promptRequirementsDataFromForm,
  requirementFormFromImportedDraft,
  requirementFormFromArtifact,
  syncCompiledRequirementFields,
} from "./requirementsForm.js";

describe("reference video requirements import mapping", () => {
  it("maps imported draft fields into factor state and compiled requirement fields", () => {
    const fallback = requirementFormFromArtifact(null);
    const form = requirementFormFromImportedDraft(
      {
        image: {
          style: "真实电商产品摄影",
          composition: "主体稳定",
          avoid: ["文字贴片", "商品变形"],
        },
        script: {
          tone: "直接可信",
          structure: "开场痛点，中段证明，结尾行动引导",
        },
        storyboard: {
          rhythm: "快节奏卖点证明",
          beats: ["吸引注意", "展示卖点"],
        },
        shotImage: {
          global: "分镜图保持场景连续",
        },
        shotVideo: {
          global: "镜头运动平滑",
        },
      },
      fallback,
    );

    assert.deepEqual(
      {
        imageStyle: form.imageStyle,
        imageComposition: form.imageComposition,
        imageAvoid: form.imageAvoid,
        scriptTone: form.scriptTone,
        storyboardRhythm: form.storyboardRhythm,
        shotImageGlobal: form.shotImageGlobal,
        shotVideoGlobal: form.shotVideoGlobal,
      },
      {
        imageStyle: "真实电商产品摄影",
        imageComposition: "主体稳定",
        imageAvoid: "文字贴片，商品变形",
        scriptTone: "直接可信",
        storyboardRhythm: "快节奏卖点证明",
        shotImageGlobal: "分镜图保持场景连续",
        shotVideoGlobal: "镜头运动平滑",
      },
    );
    assert.deepEqual(form.creativeFactors, {
      productType: "durable-good",
      audience: "youth",
      strategy: "scenario-demo",
    });
    assert.equal(
      form.factorGuidance.productType.subjectPresentation,
      "真实展示商品主体、关键功能部位、使用场景和必要配件。",
    );
    assert.equal(
      form.scriptInfluence.strategy.openingPattern,
      "用真实使用场景或操作瞬间开场,快速说明商品如何解决问题。",
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
      status: "applied",
    });
    assert.equal(
      form.factorGuidance.productType.subjectPresentation,
      subjectPresentation.value,
    );
    assert.deepEqual(data.creativeRequirementTemplate, form.creativeRequirementTemplate);
    assert.deepEqual(
      data.compiledRequirementSourceMap?.imageStyle.map((source) => source.label),
      ["商品/服务类型:主体呈现"],
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
          subjectPresentation: "展示产品开封、近景质地和真实使用动作。",
        },
      },
      scriptInfluence: form.scriptInfluence,
      creativeRequirementTemplate: {
        ...form.creativeRequirementTemplate!,
        status: "customized",
      },
    });

    const data = promptRequirementsDataFromForm(customized);

    assert.equal(data.image?.style, "展示产品开封、近景质地和真实使用动作。 保持真实拍摄质感和商品/服务身份可识别。");
    assert.equal(data.creativeRequirementTemplate?.status, "customized");
    assert.deepEqual(
      data.compiledRequirementSourceMap?.shotVideoGlobal.map((source) => source.label),
      ["推销手法:开场方式", "商品/服务类型:场景与交付"],
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
          openingHook: "先用用户自定义的真实开场想法切入。",
        },
      },
      scriptInfluence: form.scriptInfluence,
      creativeRequirementTemplate: form.creativeRequirementTemplate,
    });
    const data = promptRequirementsDataFromForm(customized);

    assert.equal(
      data.shotVideo?.global,
      "先用用户自定义的真实开场想法切入。 按需求场景、功能展示、细节证明和使用结果推进。",
    );
  });
});
