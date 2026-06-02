#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitDisabledRealModelTest } from "./real-model-test-policy.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function usage() {
  return [
    "Usage:",
    "  pnpm realitest",
    "  node scripts/run-realitest.mjs",
    "",
    "Disabled: multi-real-model integration tests are closed.",
    "Use pnpm --filter @aigc-video/server test:integration:smoke for backend image/video smoke.",
  ].join("\n");
}

if (process.argv.includes("--help")) {
  console.log(usage());
  process.exit(0);
}

exitDisabledRealModelTest("realitest");

const result = spawnSync(
  process.execPath,
  ["scripts/run-agent-chain-test.mjs", ...process.argv.slice(2)],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
