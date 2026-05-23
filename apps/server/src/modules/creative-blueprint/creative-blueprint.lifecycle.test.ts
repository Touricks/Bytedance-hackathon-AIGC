import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { creativeBlueprintService } from "./creative-blueprint.service.js";

describe("creative blueprint lifecycle", () => {
  it("creates a new draft version when regenerating from a frozen blueprint", () => {
    const frozen = creativeBlueprintService.createCreativeBlueprint({
      title: "Portable Mini Blender",
      sellingPoints: "USB-C charging",
      audience: "busy office workers",
      stylePreference: "clean premium ecommerce",
      imageUrl: "/mocks/products/demo-product.svg"
    });

    creativeBlueprintService.freezeCreativeBlueprint(frozen.scriptId);
    creativeBlueprintService.freezeCreativeBlueprint(frozen.scriptId);

    const nextDraft = creativeBlueprintService.createCreativeBlueprint({
      draftScriptId: frozen.scriptId,
      title: "Portable Mini Blender Pro",
      sellingPoints: "quiet motor and dishwasher-safe cup",
      audience: "fitness beginners",
      stylePreference: "bright studio demo",
      imageUrl: "/mocks/products/demo-product.svg"
    });

    const frozenAgain = creativeBlueprintService.getCreativeBlueprint(frozen.scriptId);

    assert.notEqual(nextDraft.scriptId, frozen.scriptId);
    assert.equal(nextDraft.script.version, 2);
    assert.equal(nextDraft.script.parentScriptId, frozen.scriptId);
    assert.notEqual(nextDraft.product.id, frozen.product.id);
    assert.equal(nextDraft.product.title, "Portable Mini Blender Pro");
    assert.equal(frozenAgain.product.title, "Portable Mini Blender");
    assert.equal(frozenAgain.script.frozen, true);
  });

  it("allows multiple generation attempts from one frozen scriptId", () => {
    const blueprint = creativeBlueprintService.createCreativeBlueprint({
      title: "Portable Mini Blender",
      sellingPoints: "USB-C charging",
      audience: "busy office workers",
      stylePreference: "clean premium ecommerce",
      imageUrl: "/mocks/products/demo-product.svg"
    });

    const firstAttempt = creativeBlueprintService.createGenerationAttempt(
      blueprint.scriptId
    );
    const secondAttempt = creativeBlueprintService.createGenerationAttempt(
      blueprint.scriptId
    );
    const frozen = creativeBlueprintService.getCreativeBlueprint(blueprint.scriptId);

    assert.notEqual(firstAttempt.id, secondAttempt.id);
    assert.equal(firstAttempt.scriptId, blueprint.scriptId);
    assert.equal(secondAttempt.scriptId, blueprint.scriptId);
    assert.equal(frozen.script.frozen, true);
  });
});
