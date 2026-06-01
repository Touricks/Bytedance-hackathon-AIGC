#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function usage() {
  return [
    "Usage:",
    "  pnpm realitest",
    "  node scripts/run-realitest.mjs",
    "",
    "Runs the V2 real-provider agent-chain Newman smoke.",
    "For multi-shot parallel acceptance, use pnpm realitest:parallel.",
  ].join("\n");
}

if (process.argv.includes("--help")) {
  console.log(usage());
  process.exit(0);
}

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
