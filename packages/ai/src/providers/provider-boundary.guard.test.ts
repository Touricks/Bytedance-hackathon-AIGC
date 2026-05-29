import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const aiSrcRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const repoRoot = path.resolve(aiSrcRoot, "../../..");

async function collectTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(entryPath);
      }
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        return [entryPath];
      }
      return [];
    })
  );

  return nested.flat();
}

describe("provider boundary guardrails", () => {
  it("does not export legacy Seed text or P1 TTS shims as active providers", async () => {
    const indexSource = await readFile(path.join(aiSrcRoot, "index.ts"), "utf8");

    assert.doesNotMatch(indexSource, /seed-text\.provider/);
    assert.doesNotMatch(indexSource, /tts\.provider/);
    assert.doesNotMatch(indexSource, /one-click-video\.workflow/);
    assert.doesNotMatch(indexSource, /regenerate-script\.workflow/);
  });

  it("keeps direct model SDK and provider transport construction inside approved provider modules", async () => {
    const files = (
      await Promise.all([
        collectTypeScriptFiles(path.join(repoRoot, "packages/ai/src")),
        collectTypeScriptFiles(path.join(repoRoot, "apps/server/src"))
      ])
    ).flat();
    const approvedFiles = new Set([
      path.join(repoRoot, "packages/ai/src/providers/ark-text.provider.ts"),
      path.join(repoRoot, "packages/ai/src/providers/seedance-video.provider.ts"),
      path.join(repoRoot, "packages/ai/src/providers/ark-image.provider.ts")
    ]);
    const directProviderPatterns = [
      /from\s+["']openai["']/,
      /new\s+OpenAI\s*\(/,
      /contents\/generations\/tasks/,
      /chat\/completions/,
      /Authorization:\s*`Bearer/
    ];
    const violations: string[] = [];

    for (const file of files) {
      if (approvedFiles.has(file) || file.endsWith(".test.ts")) {
        continue;
      }

      const source = await readFile(file, "utf8");
      if (directProviderPatterns.some((pattern) => pattern.test(source))) {
        violations.push(path.relative(repoRoot, file));
      }
    }

    assert.deepEqual(violations, []);
  });
});
