#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) return null;
  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!key) return null;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadRepoEnv() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8").split(/\r?\n/).map(parseDotEnvLine).filter(Boolean),
  );
}

function usage() {
  return [
    "Usage:",
    "  node scripts/reset-dev-session.mjs --yes",
    "  pnpm reset:dev -- --yes",
    "",
    "Stops dev listeners, clears Postgres + Redis queues, then starts pnpm dev.",
    "",
    "Options:",
    "  --yes     Required. Execute cleanup and restart.",
    "  --no-dev  Stop and clean only; do not start pnpm dev.",
    "  --help    Show this help text.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const allowed = new Set(["--yes", "--no-dev", "--help"]);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.join(", ")}\n\n${usage()}`);
  }
  return {
    yes: args.includes("--yes"),
    noDev: args.includes("--no-dev"),
    help: args.includes("--help"),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

function output(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0 && result.status !== 1) {
    return "";
  }
  return result.stdout.trim();
}

function processRows() {
  const stdout = output("ps", ["-axo", "pid=,ppid=,command="]);
  return stdout
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) return null;
      return {
        pid: match[1],
        ppid: match[2],
        command: match[3]
      };
    })
    .filter(Boolean);
}

function processCwd(pid) {
  const stdout = output("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith("n"));
  return line ? line.slice(1) : "";
}

function isInsideRepo(filePath) {
  if (!filePath) return false;
  const relativePath = path.relative(repoRoot, filePath);
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function repoDevProcessPids() {
  const devCommandPattern =
    /(pnpm( run)? dev(-latest)?\b|turbo dev\b|tsx\/dist\/cli\.mjs watch src\/main\.ts|vite\.js --host 0\.0\.0\.0)/;
  return processRows()
    .filter((row) => devCommandPattern.test(row.command))
    .filter((row) => isInsideRepo(processCwd(row.pid)))
    .map((row) => row.pid);
}

function withDescendants(rootPids) {
  const rows = processRows();
  const childrenByParent = new Map();
  for (const row of rows) {
    const children = childrenByParent.get(row.ppid) ?? [];
    children.push(row.pid);
    childrenByParent.set(row.ppid, children);
  }

  const found = new Set(rootPids);
  const queue = [...rootPids];
  while (queue.length > 0) {
    const pid = queue.shift();
    for (const childPid of childrenByParent.get(pid) ?? []) {
      if (found.has(childPid)) continue;
      found.add(childPid);
      queue.push(childPid);
    }
  }
  return [...found];
}

function listenerPids(port) {
  if (!port) return [];
  const stdout = output("lsof", ["-ti", `TCP:${port}`, "-sTCP:LISTEN"]);
  return stdout
    .split(/\r?\n/)
    .map((pid) => pid.trim())
    .filter(Boolean);
}

function stopPortListeners(ports) {
  const pids = [
    ...new Set(
      withDescendants([...ports.flatMap(listenerPids), ...repoDevProcessPids()])
    )
  ];
  if (pids.length === 0) {
    console.log("No dev listeners found.");
    return;
  }
  console.log(`Stopping dev process(es): ${pids.join(", ")}`);
  run("kill", pids);
}

function startDev() {
  console.log("Starting pnpm dev...");
  const child = spawn("pnpm", ["dev"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.yes) {
    throw new Error(`Refusing to reset without --yes.\n\n${usage()}`);
  }

  const repoEnv = loadRepoEnv();
  Object.assign(process.env, Object.fromEntries(Object.entries(repoEnv).filter(([key]) => !(key in process.env))));
  const serverPort = process.env.SERVER_PORT || "3000";
  const webPort = process.env.WEB_PORT || "5173";

  stopPortListeners([serverPort, webPort]);
  run("node", ["scripts/clear-postgres.mjs", "--yes"]);
  run("node", ["scripts/clear-redis.mjs", "--yes"]);
  if (!args.noDev) startDev();
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
