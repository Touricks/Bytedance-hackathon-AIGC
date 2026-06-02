#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitDisabledRealModelTest } from "./real-model-test-policy.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const requireFromServer = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
);
const { Client } = requireFromServer("pg");
const collectionPath = path.join(
  repoRoot,
  "docs/test/agent-chain/agent-chain.postman.json",
);
const environmentPath = path.join(
  repoRoot,
  "docs/test/agent-chain/agent-chain.env.json",
);
const dataPath = path.join(
  repoRoot,
  "docs/test/agent-chain/agent-chain.data.json",
);
const healthTimeoutMs = Number(
  process.env.AGENTTEST_HEALTH_TIMEOUT_MS ?? 120_000,
);

let devProcess;

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
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    process.env[key] ??= value;
  }
}

function usage() {
  return [
    "Usage:",
    "  pnpm agenttest:real",
    "  node scripts/run-agent-chain-test.mjs",
    "",
    "Disabled: multi-real-model integration tests are closed.",
    "Use pnpm --filter @aigc-video/server test:integration:smoke for backend image/video smoke.",
    "",
    "Options:",
    "  --no-reset    Retired; kept for old callers.",
    "  --no-dev      Retired; kept for old callers.",
    "  --help        Show this help text.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const allowed = new Set(["--no-reset", "--no-dev", "--help"]);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.join(", ")}\n\n${usage()}`);
  }
  return {
    noReset: args.includes("--no-reset"),
    noDev: args.includes("--no-dev"),
    help: args.includes("--help"),
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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

async function resolvePostmanVariable(key) {
  const environment = await readJson(environmentPath);
  const environmentValue = postmanVariableValue(environment, key);
  if (environmentValue) return environmentValue;

  const collection = await readJson(collectionPath);
  return postmanVariableValue(collection, key);
}

function assertSafeWorkspaceDirectory(workspaceDirectory) {
  if (!workspaceDirectory) {
    throw new Error(
      "workspaceDirectory is required in docs/test/agent-chain/agent-chain.env.json",
    );
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
  console.log(`Reset agent-chain workspace state: ${daireelPath}`);
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

async function exportedEnvironmentVariables(exportedEnvironmentPath) {
  const exportedEnvironment = await readJson(exportedEnvironmentPath);
  const pollMaxAttempts = Number(
    postmanVariableValue(exportedEnvironment, "pollMaxAttempts") || 100,
  );
  const pollIntervalMs = Number(
    postmanVariableValue(exportedEnvironment, "pollIntervalMs") || 3000,
  );
  return {
    workspaceId: postmanVariableValue(exportedEnvironment, "workspaceId"),
    shotSetId: postmanVariableValue(exportedEnvironment, "shotSetId"),
    shotIds: JSON.parse(
      postmanVariableValue(exportedEnvironment, "shotIds") || "[]",
    ),
    pollMaxAttempts,
    pollIntervalMs,
  };
}

async function assertAgentChainDbState(input, options = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for agent-chain DB assertions");
  }
  if (!input.workspaceId) {
    throw new Error("Newman did not export workspaceId");
  }
  if (!input.shotSetId) {
    throw new Error("Newman did not export shotSetId");
  }
  if (!Array.isArray(input.shotIds) || input.shotIds.length === 0) {
    throw new Error("Newman did not export shotIds");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const selectionTables = [
      "image_select_artifacts",
      "video_select_artifacts",
    ];
    for (const table of selectionTables) {
      const exists = await client.query(
        "select to_regclass($1) is not null as exists",
        [table],
      );
      if (exists.rows[0]?.exists !== true) {
        throw new Error(`${table} must exist for V2 selection persistence`);
      }
    }

    const moduleTables = [
      "prompt_requirements_artifacts",
      "material_intake_artifacts",
      "product_brief_artifacts",
      "storyboard_artifacts",
      "shot_prompt_artifacts",
    ];
    for (const table of moduleTables) {
      const result = await client.query(
        `select
           count(*)::integer as count,
           bool_and(
             length(prompt_assembly->>'subjectHash') = 64
             and length(prompt_assembly->>'contractHash') = 64
             and prompt_assembly->>'subjectTemplateId' <> prompt_assembly->>'contractTemplateId'
           ) as has_prompt_assembly_hashes
         from ${table}
         where workspace_id = $1
           and status = 'approved'
           and is_current = true`,
        [input.workspaceId],
      );
      if (result.rows[0]?.count !== 1) {
        throw new Error(
          `${table} should have exactly one current approved artifact`,
        );
      }
      if (result.rows[0]?.has_prompt_assembly_hashes !== true) {
        throw new Error(
          `${table} current approved artifact should persist split prompt assembly hashes`,
        );
      }
    }

    const legacyMainChainArtifacts = await client.query(
      `select artifact_type, count(*)::integer as count
       from workspace_artifact
       where workspace_id = $1
         and artifact_type in ('assets', 'brief', 'storyboard', 'shotprompt')
       group by artifact_type
       order by artifact_type`,
      [input.workspaceId],
    );
    if (legacyMainChainArtifacts.rows.length > 0) {
      throw new Error(
        `V2 agent-chain must not persist main-chain artifacts in workspace_artifact: ${JSON.stringify(
          legacyMainChainArtifacts.rows,
        )}`,
      );
    }

    const activeShotSet = await client.query(
      `select count(*)::integer as count
       from shot_sets
       where workspace_id = $1
         and id = $2
         and status = 'active'`,
      [input.workspaceId, input.shotSetId],
    );
    if (activeShotSet.rows[0]?.count !== 1) {
      throw new Error("Expected exactly one active shot set from Newman run");
    }

    const shotCount = await client.query(
      `select count(*)::integer as count
       from storyboard_shots
       where workspace_id = $1
         and shot_set_id = $2`,
      [input.workspaceId, input.shotSetId],
    );
    if (shotCount.rows[0]?.count !== input.shotIds.length) {
      throw new Error("Active shot set shot count does not match Newman shotIds");
    }

    const requirementsCount = await client.query(
      `select count(*)::integer as count
       from shot_prompt_requirements
       where workspace_id = $1
         and shot_set_id = $2`,
      [input.workspaceId, input.shotSetId],
    );
    if (requirementsCount.rows[0]?.count !== input.shotIds.length) {
      throw new Error(
        "shot_prompt_requirements count does not match active shot count",
      );
    }

    if (options.mediaRequired) {
      const imagePromptAssemblies = await client.query(
        `select count(distinct ipa.shot_id)::integer as count
         from image_prompt_artifacts ipa
         join storyboard_shots ss on ss.id = ipa.shot_id
         where ss.workspace_id = $1
           and ss.shot_set_id = $2
           and length(ipa.prompt_assembly->>'subjectHash') = 64
           and length(ipa.prompt_assembly->>'contractHash') = 64`,
        [input.workspaceId, input.shotSetId],
      );
      if (imagePromptAssemblies.rows[0]?.count !== input.shotIds.length) {
        throw new Error(
          "image_prompt_artifacts must persist split prompt assembly hashes for every active shot",
        );
      }

      const videoScriptAssemblies = await client.query(
        `select count(distinct vsa.shot_id)::integer as count
         from video_script_artifacts vsa
         join storyboard_shots ss on ss.id = vsa.shot_id
         where ss.workspace_id = $1
           and ss.shot_set_id = $2
           and length(vsa.prompt_assembly->>'subjectHash') = 64
           and length(vsa.prompt_assembly->>'contractHash') = 64`,
        [input.workspaceId, input.shotSetId],
      );
      if (videoScriptAssemblies.rows[0]?.count !== input.shotIds.length) {
        throw new Error(
          "video_script_artifacts must persist split prompt assembly hashes for every active shot",
        );
      }

      const imageSelections = await client.query(
        `select count(*)::integer as count
         from image_select_artifacts
         where workspace_id = $1
           and shot_set_id = $2`,
        [input.workspaceId, input.shotSetId],
      );
      if (imageSelections.rows[0]?.count !== input.shotIds.length) {
        throw new Error(
          "image_select_artifacts count does not match active shot count",
        );
      }

      const videoSelections = await client.query(
        `select count(*)::integer as count
         from video_select_artifacts
         where workspace_id = $1
           and shot_set_id = $2`,
        [input.workspaceId, input.shotSetId],
      );
      if (videoSelections.rows[0]?.count !== input.shotIds.length) {
        throw new Error(
          "video_select_artifacts count does not match active shot count",
        );
      }

      if (!input.finalVideoJobId) {
        throw new Error("finalVideoJobId is required for media DB assertions");
      }
      const finalJob = await client.query(
        `select status, shot_set_id, source_shot_video_ids
         from final_video_jobs
         where workspace_id = $1
           and id = $2`,
        [input.workspaceId, input.finalVideoJobId],
      );
      const row = finalJob.rows[0];
      if (!row) {
        throw new Error("Final video job from media chain was not persisted");
      }
      if (row.status !== "SUCCEEDED") {
        throw new Error(`Final video job should succeed, got ${row.status}`);
      }
      if (row.shot_set_id !== input.shotSetId) {
        throw new Error("Final video job should reference the active shot set");
      }
      if (!Array.isArray(row.source_shot_video_ids)) {
        throw new Error("Final video job source_shot_video_ids must be an array");
      }
      if (row.source_shot_video_ids.length !== input.shotIds.length) {
        throw new Error(
          "Final video job source count does not match selected video count",
        );
      }
    }

    console.log(
      `Agent-chain DB assertions passed for workspace ${input.workspaceId}`,
    );
  } finally {
    await client.end();
  }
}

function startDev() {
  console.log("Starting pnpm dev for agent-chain...");
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

function parsePositiveInteger(value, label) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

async function applyAgentTestCandidateOverrides() {
  const imageCandidateCount = parsePositiveInteger(
    process.env.AGENTTEST_IMAGE_CANDIDATE_COUNT ??
      (await resolvePostmanVariable("imageCandidateCount")),
    "imageCandidateCount",
  );
  const videoCandidateCount = parsePositiveInteger(
    process.env.AGENTTEST_VIDEO_CANDIDATE_COUNT ??
      (await resolvePostmanVariable("videoCandidateCount")),
    "videoCandidateCount",
  );

  if (imageCandidateCount) {
    process.env.DEFAULT_IMAGE_CANDIDATES = String(imageCandidateCount);
    const max = Number(process.env.MAX_IMAGE_CANDIDATES_PER_SHOT ?? imageCandidateCount);
    if (max < imageCandidateCount) {
      process.env.MAX_IMAGE_CANDIDATES_PER_SHOT = String(imageCandidateCount);
    }
  }
  if (videoCandidateCount) {
    process.env.DEFAULT_VIDEO_CANDIDATES = String(videoCandidateCount);
    const max = Number(process.env.MAX_VIDEO_CANDIDATES_PER_SHOT ?? videoCandidateCount);
    if (max < videoCandidateCount) {
      process.env.MAX_VIDEO_CANDIDATES_PER_SHOT = String(videoCandidateCount);
    }
  }
}

function healthUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, "")}/api/health`;
}

async function waitForHealth(baseUrl, devChild) {
  const url = healthUrl(baseUrl);
  const deadline = Date.now() + healthTimeoutMs;
  let lastError;
  let devExit;

  devChild?.on("exit", (code, signal) => {
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

async function requestJson(input) {
  const url = `${input.baseUrl.replace(/\/+$/, "")}${input.path}`;
  const response = await fetch(url, {
    method: input.method ?? "GET",
    headers: {
      ...(input.body ? { "Content-Type": "application/json" } : {}),
      ...(input.headers ?? {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  const expectedStatus = input.expectedStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(
      `${input.method ?? "GET"} ${input.path} returned ${response.status}: ${text}`,
    );
  }
  return json;
}

function succeededCandidates(round, kind) {
  const urlKey = kind === "image" ? "imageUrl" : "videoUrl";
  return (round.candidates ?? []).filter(
    (candidate) => candidate.status === "SUCCEEDED" && candidate[urlKey],
  );
}

async function waitForMediaRound(input) {
  const terminalStatuses = new Set(["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"]);
  const roundsPath =
    input.kind === "image"
      ? `/api/workspaces/${input.workspaceId}/shots/${input.shotId}/image-rounds`
      : `/api/workspaces/${input.workspaceId}/shots/${input.shotId}/video-rounds`;
  for (let attempt = 0; attempt < input.pollMaxAttempts; attempt += 1) {
    const json = await requestJson({
      baseUrl: input.baseUrl,
      path: roundsPath,
    });
    const round = (json.data ?? []).find(
      (item) => item.batch?.id === input.batchId,
    );
    if (!round) {
      throw new Error(`${input.kind} round ${input.batchId} was not returned`);
    }
    const status = round.batch?.status;
    if (terminalStatuses.has(status)) {
      const candidates = succeededCandidates(round, input.kind);
      if (status !== "SUCCEEDED" || candidates.length === 0) {
        throw new Error(
          `${input.kind} batch ${input.batchId} ended as ${status} with ${candidates.length} succeeded candidates`,
        );
      }
      return { round, candidate: candidates[0] };
    }
    await sleep(input.pollIntervalMs);
  }
  throw new Error(`${input.kind} batch ${input.batchId} did not finish in time`);
}

async function runAgentMediaChain(input) {
  console.log(
    `Running real media chain for ${input.shotIds.length} active shots...`,
  );
  for (const shotId of input.shotIds) {
    const proposed = await requestJson({
      baseUrl: input.baseUrl,
      method: "POST",
      path: `/api/workspaces/${input.workspaceId}/shots/${shotId}/image-prompts/propose`,
      body: {
        userDirection:
          "Keep product identity stable, preserve texture, and avoid text overlays.",
      },
    });
    const batchId = proposed.batch?.id;
    if (!batchId) {
      throw new Error(`Image prompt response for shot ${shotId} did not include batch.id`);
    }
    const { candidate } = await waitForMediaRound({
      ...input,
      kind: "image",
      shotId,
      batchId,
    });
    await requestJson({
      baseUrl: input.baseUrl,
      method: "POST",
      path: `/api/workspaces/${input.workspaceId}/shots/${shotId}/image-candidates/select`,
      body: {
        imageCandidateId: candidate.id,
        imageGenerationBatchId: batchId,
      },
    });
    console.log(`Selected image candidate ${candidate.id} for shot ${shotId}`);
  }

  for (const shotId of input.shotIds) {
    const proposed = await requestJson({
      baseUrl: input.baseUrl,
      method: "POST",
      path: `/api/workspaces/${input.workspaceId}/shots/${shotId}/video-scripts/propose`,
      body: {
        userDirection:
          "Use smooth camera motion and keep the selected product image as the visual anchor.",
      },
    });
    const batchId = proposed.batch?.id;
    if (!batchId) {
      throw new Error(`Video script response for shot ${shotId} did not include batch.id`);
    }
    const { candidate } = await waitForMediaRound({
      ...input,
      kind: "video",
      shotId,
      batchId,
    });
    await requestJson({
      baseUrl: input.baseUrl,
      method: "POST",
      path: `/api/workspaces/${input.workspaceId}/shots/${shotId}/video-candidates/select`,
      body: {
        videoCandidateId: candidate.id,
        videoGenerationBatchId: batchId,
      },
    });
    console.log(`Selected video candidate ${candidate.id} for shot ${shotId}`);
  }

  const composed = await requestJson({
    baseUrl: input.baseUrl,
    method: "POST",
    path: `/api/workspaces/${input.workspaceId}/final-videos`,
    headers: {
      "Idempotency-Key": `agent-chain-final-${Date.now()}`,
    },
    body: {
      outputAspectRatio: "9:16",
    },
  });
  const finalVideoJobId = composed.data?.finalVideoJobId;
  if (!finalVideoJobId) {
    throw new Error("Final compose response did not include finalVideoJobId");
  }
  for (let attempt = 0; attempt < input.pollMaxAttempts; attempt += 1) {
    const json = await requestJson({
      baseUrl: input.baseUrl,
      path: `/api/final-videos/${finalVideoJobId}`,
    });
    const status = json.data?.status;
    if (status === "SUCCEEDED") {
      console.log(`Final video completed: ${finalVideoJobId}`);
      return { finalVideoJobId };
    }
    if (["FAILED", "CANCELLED"].includes(status)) {
      throw new Error(`Final compose ended as ${status}`);
    }
    await sleep(input.pollIntervalMs);
  }
  throw new Error(`Final compose ${finalVideoJobId} did not finish in time`);
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
  loadRepoEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  exitDisabledRealModelTest("agent-chain real-provider flow");

  const workspaceDirectory =
    process.env.AGENTTEST_WORKSPACE_DIRECTORY ??
    (await resolvePostmanVariable("workspaceDirectory"));
  const baseUrl =
    process.env.AGENTTEST_BASE_URL ??
    (await resolvePostmanVariable("baseUrl")) ??
    "http://localhost:3000";
  await applyAgentTestCandidateOverrides();

  if (!args.noReset) {
    runSync("pnpm", ["reset:dev", "--", "--yes", "--no-dev"]);
    await resetWorkspaceFiles(workspaceDirectory);
  }

  const devChild = args.noDev ? undefined : startDev();
  await waitForHealth(baseUrl, devChild);

  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-chain-"));
  const exportedEnvironmentPath = path.join(tempDir, "environment.json");
  let exported;
  try {
    await run("pnpm", [
      "exec",
      "newman",
      "run",
      path.relative(repoRoot, collectionPath),
      "-e",
      path.relative(repoRoot, environmentPath),
      "-d",
      path.relative(repoRoot, dataPath),
      "--export-environment",
      exportedEnvironmentPath,
      "--timeout-request",
      "900000",
      "--reporters",
      "cli",
    ]);
    exported = await exportedEnvironmentVariables(exportedEnvironmentPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  await assertAgentChainDbState(exported);
  const media = await runAgentMediaChain({ ...exported, baseUrl });
  await assertAgentChainDbState(
    { ...exported, ...media },
    { mediaRequired: true },
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopDev();
}
