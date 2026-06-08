import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CREATIVE_FACTORS,
  buildCreativeFactorRequirements,
  creativeFactorRequirementsDataSchema,
} from "@aigc-video/shared";
import {
  promptRequirementsDataFromForm,
  requirementFormFromArtifact,
  syncCompiledRequirementFields,
} from "./requirementsForm.js";

describe("reference video requirements import mapping", () => {
  it("maps imported four-factor artifact data into canonical form state", () => {
    const data = buildCreativeFactorRequirements({
      productCategory: "consumer-electronics",
      dealType: "search-standard",
      audience: "youth",
      strategy: "review-comparison",
    });
    const form = requirementFormFromArtifact(data);

    assert.deepEqual(form.creativeFactors, data.creativeFactors);
    assert.equal(form.factorPromptVersion, data.factorPromptVersion);
    assert.equal(form.factorComboKey, data.factorComboKey);
    assert.equal(form.compiledRequirementsHash, data.compiledRequirementsHash);
    assert.deepEqual(
      form.factorGuidance.productCategory.requiredVisualElements,
      data.factorGuidance.productCategory.requiredVisualElements,
    );
    assert.equal(form.imageStyle, data.image.style.join("；"));
    assert.equal(form.shotVideoGlobal, data.shotVideo.global.join("；"));
  });

  it("recompiles global prompt data from edited guidance fields", () => {
    const canonical = buildCreativeFactorRequirements(DEFAULT_CREATIVE_FACTORS);
    const form = syncCompiledRequirementFields({
      creativeFactors: canonical.creativeFactors,
      factorGuidance: canonical.factorGuidance,
    });
    const edited = syncCompiledRequirementFields({
      creativeFactors: form.creativeFactors,
      factorGuidance: {
        ...form.factorGuidance,
        productCategory: {
          ...form.factorGuidance.productCategory,
          requiredVisualElements: ["用户手写主体呈现"],
        },
      },
    });
    const data = creativeFactorRequirementsDataSchema.parse(
      promptRequirementsDataFromForm(edited),
    );

    assert.deepEqual(data.factorGuidance.productCategory.requiredVisualElements, [
      "用户手写主体呈现",
    ]);
    assert.ok(data.image.composition.includes("用户手写主体呈现"));
    assert.ok(data.shotImage.global.includes("用户手写主体呈现"));
    assert.notEqual(data.compiledRequirementsHash, canonical.compiledRequirementsHash);
    assert.deepEqual(data.creativeFactors, DEFAULT_CREATIVE_FACTORS);
  });

  it("does not rehydrate old productType artifacts as valid current data", () => {
    const form = requirementFormFromArtifact({
      creativeFactors: {
        productType: "durable-good",
        audience: "youth",
        strategy: "scenario-demo",
      },
    } as never);

    assert.deepEqual(form.creativeFactors, DEFAULT_CREATIVE_FACTORS);
  });
});
