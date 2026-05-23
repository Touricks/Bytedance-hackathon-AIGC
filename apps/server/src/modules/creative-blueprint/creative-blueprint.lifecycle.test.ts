import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { db } from "../../db/client.js";
import { creativeBlueprintService } from "./creative-blueprint.service.js";

describe("creative blueprint lifecycle", () => {
  before(async () => {
    await db.initialize();
  });

  after(async () => {
    await db.close();
  });

  it("creates a new draft version when regenerating from a frozen blueprint", async () => {
    const frozen = await creativeBlueprintService.createCreativeBlueprint({
      title: "Portable Mini Blender",
      sellingPoints: "USB-C charging",
      audience: "busy office workers",
      stylePreference: "clean premium ecommerce",
      imageUrl: "/mocks/products/demo-product.svg"
    });

    await creativeBlueprintService.freezeCreativeBlueprint(frozen.scriptId);
    await creativeBlueprintService.freezeCreativeBlueprint(frozen.scriptId);

    const nextDraft = await creativeBlueprintService.createCreativeBlueprint({
      draftScriptId: frozen.scriptId,
      title: "Portable Mini Blender Pro",
      sellingPoints: "quiet motor and dishwasher-safe cup",
      audience: "fitness beginners",
      stylePreference: "bright studio demo",
      imageUrl: "/mocks/products/demo-product.svg"
    });

    const frozenAgain = await creativeBlueprintService.getCreativeBlueprint(
      frozen.scriptId
    );

    assert.notEqual(nextDraft.scriptId, frozen.scriptId);
    assert.equal(nextDraft.script.version, 2);
    assert.equal(nextDraft.script.parentScriptId, frozen.scriptId);
    assert.notEqual(nextDraft.product.id, frozen.product.id);
    assert.equal(nextDraft.product.title, "Portable Mini Blender Pro");
    assert.equal(frozenAgain.product.title, "Portable Mini Blender");
    assert.equal(frozenAgain.script.frozen, true);
  });

  it("allows multiple generation attempts from one frozen scriptId", async () => {
    const blueprint = await creativeBlueprintService.createCreativeBlueprint({
      title: "Portable Mini Blender",
      sellingPoints: "USB-C charging",
      audience: "busy office workers",
      stylePreference: "clean premium ecommerce",
      imageUrl: "/mocks/products/demo-product.svg"
    });

    const firstAttempt = await creativeBlueprintService.createGenerationAttempt(
      blueprint.scriptId
    );
    const secondAttempt = await creativeBlueprintService.createGenerationAttempt(
      blueprint.scriptId
    );
    const frozen = await creativeBlueprintService.getCreativeBlueprint(
      blueprint.scriptId
    );

    assert.notEqual(firstAttempt.id, secondAttempt.id);
    assert.equal(firstAttempt.scriptId, blueprint.scriptId);
    assert.equal(secondAttempt.scriptId, blueprint.scriptId);
    assert.equal(frozen.script.frozen, true);
  });
});
