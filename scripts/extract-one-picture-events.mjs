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

function usage() {
  return [
    "Usage:",
    "  node scripts/extract-one-picture-events.mjs [options]",
    "",
    "Options:",
    "  --tail <n>       Print only the last n matching events.",
    "  --kind <text>    Print events whose kind/name contains text.",
    "  --shot <id>      Print events for a shotId.",
    "  --failed-only    Print failed/error events only.",
    "  --help           Show this help text.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    tail: null,
    kind: null,
    shot: null,
    failedOnly: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      args.help = true;
      continue;
    }
    if (arg === "--failed-only") {
      args.failedOnly = true;
      continue;
    }
    if (arg === "--tail" || arg === "--kind" || arg === "--shot") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      if (arg === "--tail") {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error("--tail must be a positive integer");
        }
        args.tail = parsed;
      } else if (arg === "--kind") {
        args.kind = value;
      } else {
        args.shot = value;
      }
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function eventName(event) {
  return String(event?.kind ?? event?.name ?? "");
}

function isFailedEvent(event) {
  const name = eventName(event);
  const status = String(event?.status ?? "");
  return /failed|error|cancelled/i.test(name) || /failed|error|cancelled/i.test(status);
}

function filterTraceLines(contents, args) {
  let lines = contents.split(/\r?\n/).filter((line) => line.trim());
  if (!args.kind && !args.shot && !args.failedOnly && !args.tail) {
    return contents;
  }

  lines = lines.filter((line) => {
    const event = JSON.parse(line);
    if (args.kind && !eventName(event).includes(args.kind)) {
      return false;
    }
    if (args.shot && event.shotId !== args.shot) {
      return false;
    }
    if (args.failedOnly && !isFailedEvent(event)) {
      return false;
    }
    return true;
  });

  if (args.tail) {
    lines = lines.slice(-args.tail);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
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
    process.stdout.write(filterTraceLines(contents, args));
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
