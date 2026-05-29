import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerSrc = readFileSync(path.join(here, "final-compose.worker.ts"), "utf8");

describe("final-compose provider boundary", () => {
  for (const forbidden of [
    "ark-text.provider",
    "ark-image.provider",
    "seedance-video.provider",
    "@aigc-video/ai/agents",
    "runStoryboardImagePromptAgent",
    "runVideoShotScriptAgent",
  ]) {
    it(`does not import ${forbidden}`, () => {
      assert.equal(workerSrc.includes(forbidden), false);
    });
  }
});
