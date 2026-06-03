import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCreativeRequirementTemplatesForStartup } from "./setup-template.service.js";

describe("setupTemplateService", () => {
  it("validates setup templates at startup", () => {
    const templates = validateCreativeRequirementTemplatesForStartup();

    assert.equal(templates.length, 3);
    assert.equal(templates[0]?.id, "real-product-demo");
  });

  it("fails fast when setup template content is invalid", () => {
    assert.throws(
      () =>
        validateCreativeRequirementTemplatesForStartup([
          {
            id: "broken",
            name: "Broken",
            summary: "Missing values",
            values: {},
          },
        ]),
      /Required/,
    );
  });
});
