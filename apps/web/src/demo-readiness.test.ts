import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function assertMentions(source: string, terms: string[]) {
  for (const term of terms) {
    assert.ok(source.includes(term), `Expected demo readiness docs to mention ${term}`);
  }
}

describe("demo readiness handoff", () => {
  it("documents the V0 route, setup modes, validation, and out-of-scope boundary", () => {
    const docs = [
      readRepoFile("README.md"),
      readRepoFile("docs/plan_0523/current-support/model-smoke.md"),
      readRepoFile("docs/plan_0523/current-support/demo-readiness.md"),
      readRepoFile("docs/plan_0523/current-support/provider-contract-correction.md")
    ].join("\n");

    assertMentions(docs, [
      "上传素材",
      "创作蓝图",
      "一键成片",
      "任务进度",
      "预览导出",
      "docker compose -f infra/docker-compose.yml up -d",
      "ARK_API_KEY",
      "ARK_TEXT_ENDPOINT_ID",
      "ARK_VIDEO_ENDPOINT_ID",
      "fallback LLM",
      "MOCK_FINAL_VIDEO_URL",
      "pnpm --filter @aigc-video/web test",
      "pnpm --filter @aigc-video/server test",
      "pnpm --filter @aigc-video/ai test",
      "pnpm typecheck",
      "pnpm lint",
      "pnpm build",
      "检索",
      "TTS",
      "字幕",
      "BGM",
      "数据看板",
      "A/B 对比",
      "复杂分镜编辑"
    ]);
  });

  it("ships public demo assets for uploaded product media and onsite fallback video", () => {
    const productImagePath = resolve(repoRoot, "apps/web/public/mocks/products/demo-product.svg");
    const fallbackVideoPath = resolve(repoRoot, "apps/web/public/mocks/videos/fallback-flower.mp4");

    assert.ok(existsSync(productImagePath), "Expected demo product image asset");
    assert.ok(existsSync(fallbackVideoPath), "Expected fallback demo video asset");
    assert.ok(statSync(productImagePath).size > 1000, "Expected product image to be non-empty");
    assert.ok(statSync(fallbackVideoPath).size > 10000, "Expected fallback video to be non-empty");
  });
});
