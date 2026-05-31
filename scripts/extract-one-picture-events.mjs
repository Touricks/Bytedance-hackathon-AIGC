#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const environmentPath = path.join(repoRoot, "docs", "test", "provider.env.json");

function postmanVariableValue(document, key) {
  const values = Array.isArray(document.values) ? document.values : document.variable;
  if (!Array.isArray(values)) return undefined;

  const variable = values.find((item) => item?.key === key && item.enabled !== false);
  return typeof variable?.value === "string" ? variable.value : undefined;
}

async function resolveWorkspaceDirectory() {
  if (process.env.REALITEST_WORKSPACE_DIRECTORY) {
    return process.env.REALITEST_WORKSPACE_DIRECTORY;
  }

  try {
    const environment = JSON.parse(await readFile(environmentPath, "utf8"));
    return postmanVariableValue(environment, "workspaceDirectory");
  } catch {
    return undefined;
  }
}

async function main() {
  const workspaceDirectory = await resolveWorkspaceDirectory();
  const traceFilePath = path.join(
    workspaceDirectory ? path.resolve(workspaceDirectory) : repoRoot,
    workspaceDirectory ? "" : "integrationTest_v0",
    workspaceDirectory ? "" : "onePicture",
    ".daireel",
    "trace",
    "events.jsonl",
  );

  try {
    const contents = await readFile(traceFilePath, "utf8");
    process.stdout.write(contents);
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.error(`Trace events file not found: ${traceFilePath}`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

await main();
