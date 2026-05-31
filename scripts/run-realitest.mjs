#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { rm, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const collectionPath = path.join(repoRoot, "docs/test/provider.json");
const environmentPath = path.join(repoRoot, "docs/test/provider.env.json");
const healthTimeoutMs = Number(
  process.env.REALITEST_HEALTH_TIMEOUT_MS ?? 120_000,
);

let devProcess;

function usage() {
  return [
    "Usage:",
    "  pnpm realitest",
    "  node scripts/run-realitest.mjs",
    "",
    "Resets dev state, removes the target workspace .daireel/ directory,",
    "starts pnpm dev, waits for /api/health, then runs the single-shot provider Newman smoke.",
  ].join("\n");
}

function postmanVariableValue(document, key) {
  const values = Array.isArray(document.values)
    ? document.values
    : document.variable;
  if (!Array.isArray(values)) return undefined;

  const variable = values.find(
    (item) => item?.key === key && item.enabled !== false,
  );
  return typeof variable?.value === "string" ? variable.value : undefined;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function resolvePostmanVariable(key) {
  const environment = await readJson(environmentPath);
  const environmentValue = postmanVariableValue(environment, key);
  if (environmentValue) return environmentValue;

  const collection = await readJson(collectionPath);
  return postmanVariableValue(collection, key);
}

function assertSafeWorkspaceDirectory(workspaceDirectory) {
  if (!workspaceDirectory) {
    throw new Error("workspaceDirectory is required in docs/test/provider.env.json");
  }

  const workspacePath = path.resolve(workspaceDirectory);
  if (!path.isAbsolute(workspacePath)) {
    throw new Error(`workspaceDirectory must be absolute: ${workspaceDirectory}`);
  }

  if (workspacePath === path.parse(workspacePath).root) {
    throw new Error("Refusing to use filesystem root as workspaceDirectory");
  }

  return workspacePath;
}

async function resetWorkspaceFiles(workspaceDirectory) {
  const workspacePath = assertSafeWorkspaceDirectory(workspaceDirectory);
  const daireelPath = path.resolve(workspacePath, ".daireel");

  if (
    path.basename(daireelPath) !== ".daireel" ||
    path.dirname(daireelPath) !== workspacePath
  ) {
    throw new Error(`Refusing to remove unsafe workspace state path: ${daireelPath}`);
  }

  await rm(daireelPath, { recursive: true, force: true });
  console.log(`Reset realitest workspace state: ${daireelPath}`);
}

function runSync(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}`,
    );
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ?? `exit ${code}`}`,
        ),
      );
    });
  });
}

function startDev() {
  console.log("Starting pnpm dev for realitest...");
  const child = spawn("pnpm", ["dev"], {
    cwd: repoRoot,
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit",
  });
  devProcess = child;
  return child;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function healthUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, "")}/api/health`;
}

async function waitForHealth(baseUrl, devChild) {
  const url = healthUrl(baseUrl);
  const deadline = Date.now() + healthTimeoutMs;
  let lastError;
  let devExit;

  devChild.on("exit", (code, signal) => {
    devExit = new Error(
      `pnpm dev exited before health check completed (${signal ?? `exit ${code}`})`,
    );
  });

  while (Date.now() < deadline) {
    if (devExit) throw devExit;

    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 2_000);
      const response = await fetch(url, { signal: controller.signal });

      if (response.ok) {
        const body = await response.json().catch(() => null);
        if (!body || body.ok !== false) {
          console.log(`Backend is healthy: ${url}`);
          return;
        }
      }
      lastError = new Error(`GET ${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    await sleep(1_000);
  }

  const detail =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for backend health at ${url}.${detail}`);
}

async function stopDev() {
  if (
    !devProcess ||
    devProcess.exitCode !== null ||
    devProcess.signalCode !== null
  ) {
    return;
  }

  console.log("Stopping pnpm dev...");
  const close = new Promise((resolve) => devProcess.once("close", resolve));
  try {
    if (process.platform === "win32") {
      devProcess.kill("SIGTERM");
    } else {
      process.kill(-devProcess.pid, "SIGTERM");
    }
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "ESRCH") {
      console.warn(error instanceof Error ? error.message : error);
    }
  }

  const stopped = await Promise.race([
    close.then(() => true),
    sleep(5_000).then(() => false),
  ]);
  if (!stopped) {
    try {
      if (process.platform === "win32") {
        devProcess.kill("SIGKILL");
      } else {
        process.kill(-devProcess.pid, "SIGKILL");
      }
    } catch (error) {
      if (!(error instanceof Error) || error.code !== "ESRCH") {
        console.warn(error instanceof Error ? error.message : error);
      }
    }
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(usage());
    return;
  }

  const workspaceDirectory =
    process.env.REALITEST_WORKSPACE_DIRECTORY ??
    await resolvePostmanVariable("workspaceDirectory");
  const baseUrl =
    process.env.REALITEST_BASE_URL ??
    await resolvePostmanVariable("baseUrl") ??
    "http://localhost:3000";

  runSync("pnpm", ["reset:dev", "--", "--yes", "--no-dev"]);
  await resetWorkspaceFiles(workspaceDirectory);

  const devChild = startDev();
  await waitForHealth(baseUrl, devChild);

  await run("pnpm", [
    "exec",
    "newman",
    "run",
    "docs/test/provider.json",
    "-e",
    "docs/test/provider.env.json",
    "--timeout-request",
    "900000",
    "--reporters",
    "cli",
  ]);
}

process.once("SIGINT", () => {
  void stopDev().finally(() => process.exit(130));
});
process.once("SIGTERM", () => {
  void stopDev().finally(() => process.exit(143));
});

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopDev();
}
