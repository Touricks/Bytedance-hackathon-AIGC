import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PromptRequirementsData } from "../../lib/api/client.js";
import { runStartCreativeReviewSequence } from "./startCreativeReviewSequence.js";

describe("runStartCreativeReviewSequence", () => {
  it("refreshes workspace after approving requirements before material intake", async () => {
    const calls: string[] = [];
    const data = {} as PromptRequirementsData;

    const result = await runStartCreativeReviewSequence({
      workspaceId: "workspace_123",
      data,
      materialPrompt: "  keep towels bright  ",
      refreshWorkspace: async () => {
        calls.push("refresh");
      },
      deps: {
        proposePromptRequirements: async (input) => {
          calls.push("propose");
          assert.equal(input.workspaceId, "workspace_123");
          assert.equal(input.data, data);
          return { artifact: { id: "requirements_123" } };
        },
        approvePromptRequirements: async (input) => {
          calls.push("approve");
          assert.deepEqual(input, {
            workspaceId: "workspace_123",
            artifactId: "requirements_123",
          });
        },
        runMaterialIntake: async (input) => {
          calls.push("material");
          assert.deepEqual(input, {
            workspaceId: "workspace_123",
            prompt: "keep towels bright",
          });
          return { id: "material_123" };
        },
      },
    });

    assert.deepEqual(calls, ["propose", "approve", "refresh", "material"]);
    assert.deepEqual(result, { id: "material_123" });
  });
});
