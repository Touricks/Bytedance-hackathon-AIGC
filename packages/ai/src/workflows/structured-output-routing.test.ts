import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.resolve(here, "../agents");

function workflowSource(filename: string) {
  return readFileSync(path.join(here, filename), "utf8");
}

function outputTypeWorkflowFiles() {
  return readdirSync(agentsDir)
    .filter((filename) => filename.endsWith(".agent.ts"))
    .filter((filename) =>
      readFileSync(path.join(agentsDir, filename), "utf8").includes("outputType:"),
    )
    .map((filename) => filename.replace(/\.agent\.ts$/, ".workflow.ts"));
}

describe("structured-output workflow routing", () => {
  it("routes SDK outputType agents through the Responses API", () => {
    const workflowFiles = outputTypeWorkflowFiles();
    assert.deepEqual(workflowFiles.sort(), [
      "storyboard-image-prompt.workflow.ts",
      "video-shot-script.workflow.ts",
    ]);

    for (const filename of workflowFiles) {
      assert.equal(
        existsSync(path.join(here, filename)),
        true,
        `${filename} must exist for the outputType agent`,
      );
      const source = workflowSource(filename);
      assert.match(source, /buildRunner\(cfg,\s*\{\s*useResponses:\s*true\s*\}\)/);
    }
  });
});
