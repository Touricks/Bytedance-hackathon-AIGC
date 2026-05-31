#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const environmentPath = path.join(repoRoot, "docs/test/provider.env.json");

const healthTimeoutMs = Number(process.env.REALITEST_HEALTH_TIMEOUT_MS ?? 120_000);
const requestTimeoutMs = Number(process.env.REALITEST_REQUEST_TIMEOUT_MS ?? 1_800_000);
const requestRetryMaxAttempts = Number(
  process.env.REALITEST_REQUEST_RETRY_MAX_ATTEMPTS ?? 3
);
const requestRetryBaseMs = Number(
  process.env.REALITEST_REQUEST_RETRY_BASE_MS ?? 60_000
);
const pollMaxAttempts = Number(process.env.REALITEST_POLL_MAX_ATTEMPTS ?? 120);
const pollIntervalMs = Number(process.env.REALITEST_POLL_INTERVAL_MS ?? 5_000);
const finalPollMaxAttempts = Number(process.env.REALITEST_FINAL_POLL_MAX_ATTEMPTS ?? 120);
const fixedShotCount = 4;
const stableShotDurationSec = 4;

let devProcess;

function usage() {
  return [
    "Usage:",
    "  pnpm realitest:parallel",
    "  node scripts/run-realitest-parallel.mjs",
    "",
    "Resets dev state, removes the target workspace .daireel/ directory,",
    "starts pnpm dev, waits for /api/health, then runs a fixed 4-shot",
    "provider acceptance flow with concurrent video generation and audit gates.",
    "",
    "Environment overrides:",
    "  REALITEST_BASE_URL",
    "  REALITEST_WORKSPACE_DIRECTORY",
    "  REALITEST_MATERIAL_REF",
    "  REALITEST_PARALLEL_SHOTPROMPT_SOURCE=compiled|fixed",
    "  REALITEST_PARALLEL_VIDEO_BATCH_SIZE",
    "  REALITEST_REQUEST_RETRY_MAX_ATTEMPTS",
    "  REALITEST_REQUEST_RETRY_BASE_MS"
  ].join("\n");
}

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

function loadDotEnv(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, ".env");
    if (existsSync(candidate)) {
      for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
        const parsed = parseDotEnvLine(line);
        if (!parsed) continue;
        const [key, value] = parsed;
        process.env[key] ??= value;
      }
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function postmanVariableValue(document, key) {
  const values = Array.isArray(document.values) ? document.values : document.variable;
  if (!Array.isArray(values)) return undefined;

  const variable = values.find((item) => item?.key === key && item.enabled !== false);
  return typeof variable?.value === "string" ? variable.value : undefined;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function resolvePostmanVariable(key) {
  const environment = await readJson(environmentPath);
  return postmanVariableValue(environment, key);
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
  await mkdir(workspacePath, { recursive: true });
  console.log(`Reset parallel realitest workspace state: ${daireelPath}`);
}

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: options.encoding,
    stdio: options.stdio ?? "inherit"
  });

  if (result.status !== 0) {
    const detail =
      result.stderr || result.stdout
        ? `\n${[result.stdout, result.stderr].filter(Boolean).join("\n")}`
        : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}${detail}`
    );
  }
  return result;
}

function startDev() {
  console.log("Starting pnpm dev for parallel realitest...");
  const child = spawn("pnpm", ["exec", "turbo", "run", "dev", "--env-mode=loose"], {
    cwd: repoRoot,
    detached: process.platform !== "win32",
    env: { ...process.env },
    stdio: "inherit"
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
      `pnpm dev exited before health check completed (${signal ?? `exit ${code}`})`
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

  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for backend health at ${url}.${detail}`);
}

async function stopDev() {
  if (!devProcess || devProcess.exitCode !== null || devProcess.signalCode !== null) {
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
    sleep(5_000).then(() => false)
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

function urlFor(baseUrl, apiPath) {
  return `${baseUrl.replace(/\/+$/, "")}${apiPath}`;
}

function isProviderThrottle(responseStatus, payload) {
  if (responseStatus === 429) {
    return true;
  }

  const text = JSON.stringify(payload ?? "").toLowerCase();
  return (
    text.includes("429") &&
    (text.includes("tpm") ||
      text.includes("rate") ||
      text.includes("quota") ||
      text.includes("limit"))
  );
}

async function requestJson(baseUrl, method, apiPath, body, headers = {}) {
  const url = urlFor(baseUrl, apiPath);

  for (let attempt = 1; attempt <= requestRetryMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      const json = text ? JSON.parse(text) : null;
      if (!response.ok) {
        if (
          attempt < requestRetryMaxAttempts &&
          isProviderThrottle(response.status, json)
        ) {
          const delayMs = requestRetryBaseMs * attempt;
          console.warn(
            `${method} ${apiPath} hit provider throttle; retrying in ${Math.round(
              delayMs / 1000
            )}s (${attempt}/${requestRetryMaxAttempts})`
          );
          await sleep(delayMs);
          continue;
        }

        throw new Error(
          `${method} ${apiPath} returned ${response.status}: ${JSON.stringify(json)}`
        );
      }
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${method} ${apiPath} exhausted request retries`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStableWorkspaceUrl(workspaceId, url, label) {
  assert(typeof url === "string" && url.length > 0, `${label} URL is missing`);
  assert(
    url.startsWith(`/api/workspaces/${workspaceId}/`),
    `${label} must be a workspace stable URL, received ${url}`
  );
}

function stageSeconds(label, startedAt) {
  return `${label} ${(Date.now() - startedAt) / 1000}s`;
}

function fixedBrief(materialRef) {
  return {
    product: {
      name: "Parallel Acceptance Demo Product",
      category: "demo",
      keyFacts: ["portable", "clean visual identity", "fast video creation"],
      assets: [{ ref: materialRef, useAs: "primary" }]
    },
    audience: {
      who: "busy creators",
      painOrDesire: "needs reliable multishot ad generation"
    },
    coreSellingPoint: "快速生成多镜头短视频广告",
    proof: ["素材展示了产品外观", "四个镜头覆盖开场、卖点、证明和行动引导"],
    offer: null,
    platform: "Seedance",
    brandTone: "clean premium ecommerce",
    bannedExpressions: [],
    landingInfo: null,
    assumptions: ["Parallel realitest uses a fixed approved brief."]
  };
}

function fixedStoryboard(materialRef) {
  return {
    narrative:
      "面向需要快速制作演示内容的忙碌创作者，通过连续四个镜头展示产品价值，并验证多 shot 真实媒体生成链路。",
    totalDurationSec: fixedShotCount * stableShotDurationSec,
    shots: [
      {
        index: 0,
        purpose: "hook",
        durationSec: stableShotDurationSec,
        scene: "简洁明亮的居家办公桌面场景",
        visualDirection: "镜头缓慢拉近，聚焦到摆放的产品上，保持真实质感。",
        productAssetRef: materialRef,
        voiceover: "做内容的朋友们，还在熬夜剪演示视频吗？",
        transition: "cut"
      },
      {
        index: 1,
        purpose: "benefit",
        durationSec: stableShotDurationSec,
        scene: "同一桌面场景中展示产品整体外观",
        visualDirection: "平稳展示产品整体外观，凸显简洁设计和高效制作体验。",
        productAssetRef: materialRef,
        voiceover: "这款工具可以帮你快速生成短视频广告，效率直接拉满！",
        transition: "match cut"
      },
      {
        index: 2,
        purpose: "proof",
        durationSec: stableShotDurationSec,
        scene: "产品细节和使用情境的可信证明",
        visualDirection: "特写展示产品边缘、屏幕和桌面环境，强化真实可用感。",
        productAssetRef: materialRef,
        voiceover: "外观简约轻便，产品素材清晰直观，直接就能用。",
        transition: "push"
      },
      {
        index: 3,
        purpose: "cta",
        durationSec: stableShotDurationSec,
        scene: "产品居中定格并形成清晰行动引导",
        visualDirection: "产品居中展示，背景干净，收束成可信的电商广告结尾。",
        productAssetRef: materialRef,
        voiceover: "想要高效做演示的朋友，赶紧安排上！",
        transition: "fade"
      }
    ],
    assumptions: [
      "Parallel realitest fixes the approved storyboard to four 4s shots.",
      "All shots reference the same product material to isolate multishot workflow stability."
    ]
  };
}

function purposeLabel(purpose) {
  return {
    hook: "开场吸引",
    benefit: "卖点展示",
    proof: "可信证明",
    cta: "行动引导"
  }[purpose];
}

function sentence(text) {
  return `${text.trim().replace(/[。.!?！？]+$/u, "")}。`;
}

function fixedShotPrompt(storyboard) {
  let cursor = 0;
  const shots = storyboard.shots.map((shot) => {
    const startSec = cursor;
    const endSec = cursor + shot.durationSec;
    cursor = endSec;
    return {
      index: shot.index,
      startSec,
      endSec,
      providerPrompt: `${startSec}-${endSec} 秒 ${purposeLabel(shot.purpose)}：${sentence(shot.scene)}${sentence(shot.visualDirection)}参考素材：${shot.productAssetRef}。`,
      referenceAssetRefs: [shot.productAssetRef],
      voiceover: shot.voiceover
    };
  });
  return {
    targetProvider: "seedance",
    durationSec: storyboard.totalDurationSec,
    aspectRatio: "9:16",
    prompt: [
      `${storyboard.totalDurationSec} 秒 9:16 电商 UGC 视频。`,
      storyboard.narrative,
      "生成一条连续完整视频，按四个已确认分镜推进节奏，商品外观始终稳定可信。"
    ].join("\n"),
    negativePrompt: "低质量，商品变形，不可读文字，水印，乱码字幕",
    shots,
    tts: {
      enabled: true,
      source: "shots.voiceover",
      voiceover: storyboard.shots.map((shot) => shot.voiceover.trim()).join(" ")
    },
    assumptions: ["Parallel realitest fixed 4-shot shotprompt."]
  };
}

function validateStoryboard(storyboard) {
  assert(storyboard.shots.length === fixedShotCount, "storyboard must have 4 shots");
  assert(
    storyboard.totalDurationSec === fixedShotCount * stableShotDurationSec,
    `storyboard totalDurationSec must be ${fixedShotCount * stableShotDurationSec}`
  );
  for (const [index, shot] of storyboard.shots.entries()) {
    assert(shot.index === index, `storyboard shot ${index} index mismatch`);
    assert(
      shot.durationSec === stableShotDurationSec,
      `storyboard shot ${index} must be ${stableShotDurationSec}s`
    );
  }
}

function validateShotPrompt(shotPrompt, storyboard) {
  assert(shotPrompt && typeof shotPrompt === "object", "shotprompt data is missing");
  assert(
    shotPrompt.targetProvider === "seedance",
    "shotprompt targetProvider must be seedance"
  );
  assert(
    shotPrompt.durationSec === storyboard.totalDurationSec,
    "shotprompt duration mismatch"
  );
  assert(
    shotPrompt.shots.length === storyboard.shots.length,
    "shotprompt must have 4 shots"
  );
  for (const [index, shot] of shotPrompt.shots.entries()) {
    const storyboardShot = storyboard.shots[index];
    assert(
      shot.index === storyboardShot.index,
      `shotprompt shot ${index} index mismatch`
    );
    assert(
      shot.endSec - shot.startSec === storyboardShot.durationSec,
      `shotprompt shot ${index} duration mismatch`
    );
    assert(
      shot.referenceAssetRefs.includes(storyboardShot.productAssetRef),
      `shotprompt shot ${index} must reference ${storyboardShot.productAssetRef}`
    );
    assert(
      typeof shot.providerPrompt === "string" && shot.providerPrompt.trim().length > 0,
      `shotprompt shot ${index} providerPrompt is empty`
    );
  }
}

async function ensureMaterialAvailable(
  baseUrl,
  workspaceId,
  workspaceDirectory,
  materialRef
) {
  const rootMaterial = path.join(workspaceDirectory, materialRef);
  if (existsSync(rootMaterial)) return;

  const fixture = path.join(repoRoot, "apps/server/test/helpers/fixtures/red-apple.png");
  const bytes = await readFile(fixture);
  await requestJson(baseUrl, "POST", "/api/workspaces/materials", {
    workspaceId,
    filename: materialRef,
    dataBase64: bytes.toString("base64")
  });
}

async function latestRound(baseUrl, workspaceId, shotId, kind, batchId) {
  const pathPart = kind === "image" ? "image-rounds" : "video-rounds";
  const rounds = await requestJson(
    baseUrl,
    "GET",
    `/api/workspaces/${workspaceId}/shots/${shotId}/${pathPart}`
  );
  const data = rounds?.data;
  assert(Array.isArray(data), `${kind} rounds response must contain data[]`);
  if (batchId) {
    return data.find((round) => round?.batch?.id === batchId);
  }
  return data[0];
}

async function pollSucceededRound(baseUrl, workspaceId, shot, kind, batchId) {
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= pollMaxAttempts; attempt += 1) {
    const round = await latestRound(baseUrl, workspaceId, shot.id, kind, batchId);
    const batch = round?.batch;
    if (batch?.status === "SUCCEEDED") {
      assert(batch.failedCount === 0, `${kind} batch ${batch.id} failedCount must be 0`);
      assert(
        batch.succeededCount === batch.requestedCount,
        `${kind} batch ${batch.id} must fully succeed`
      );
      const candidates = Array.isArray(round.candidates) ? round.candidates : [];
      const succeeded = candidates.filter(
        (candidate) => candidate.status === "SUCCEEDED"
      );
      assert(succeeded.length > 0, `${kind} batch ${batch.id} must produce candidates`);
      return {
        ...round,
        succeededCandidates: succeeded,
        elapsedMs: Date.now() - startedAt
      };
    }
    if (["FAILED", "PARTIAL", "CANCELLED"].includes(batch?.status)) {
      throw new Error(`${kind} batch ${batch.id} ended as ${batch.status}`);
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(
    `Timed out waiting for ${kind} batch ${batchId ?? "latest"} on shot ${shot.id}`
  );
}

function batchIdFromPropose(response) {
  return response?.batch?.id ?? response?.data?.batchId ?? response?.data?.id;
}

async function assertAllFulfilled(label, settled) {
  const failures = settled.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new Error(
      `${label} failed: ${failures
        .map(
          (result) =>
            result.reason?.stack ?? result.reason?.message ?? String(result.reason)
        )
        .join("\n")}`
    );
  }
  return settled.map((result) => result.value);
}

async function pollFinalJob(baseUrl, finalVideoJobId) {
  for (let attempt = 1; attempt <= finalPollMaxAttempts; attempt += 1) {
    const job = await requestJson(baseUrl, "GET", `/api/final-videos/${finalVideoJobId}`);
    const data = job?.data;
    assert(data, "final video job response missing data");
    if (data.status === "SUCCEEDED") return data;
    if (["FAILED", "CANCELLED"].includes(data.status)) {
      throw new Error(
        `final compose ended as ${data.status}: ${data.errorMessage ?? ""}`
      );
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for final compose ${finalVideoJobId}`);
}

async function scanReviewGate(workspaceDirectory) {
  const reviewPath = path.join(
    workspaceDirectory,
    ".daireel/review/storyboard.approved.json"
  );
  const review = await readJson(reviewPath);
  const shots = review?.data?.shots;
  assert(Array.isArray(shots), "storyboard.approved.json must contain data.shots[]");
  assert(
    shots.length >= fixedShotCount,
    "storyboard.approved.json must contain at least 4 shots"
  );
  return { reviewPath, shotCount: shots.length };
}

async function scanTraceGate(baseUrl, workspaceDirectory, workspaceId) {
  const tracePath = path.join(workspaceDirectory, ".daireel/trace/events.jsonl");
  const badFileEvents = [];
  try {
    const raw = await readFile(tracePath, "utf8");
    for (const [index, line] of raw.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      const name = event.kind ?? event.name ?? "";
      if (name === "provider.failed" || name === "batch.failed") {
        badFileEvents.push({ line: index + 1, name, event });
      }
    }
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "ENOENT") throw error;
  }

  const traceRows = await requestJson(
    baseUrl,
    "GET",
    `/api/workspaces/${workspaceId}/traces?limit=500`
  );
  const dbFailedEvents = Array.isArray(traceRows)
    ? traceRows.filter((event) => /(^|_)failed$/i.test(event.name))
    : [];

  assert(
    badFileEvents.length === 0,
    `trace file contains failed provider/batch events: ${JSON.stringify(badFileEvents)}`
  );
  assert(
    dbFailedEvents.length === 0,
    `DB trace contains failed events: ${JSON.stringify(dbFailedEvents)}`
  );
  return { tracePath, dbTraceCount: Array.isArray(traceRows) ? traceRows.length : 0 };
}

async function runDbAudit(workspaceId, finalVideoJobId) {
  const code = `
    import { Pool } from "pg";
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for realitest:parallel DB audit");
    const pool = new Pool({ connectionString: databaseUrl });
    const workspaceId = process.env.REALITEST_WORKSPACE_ID;
    const finalVideoJobId = process.env.REALITEST_FINAL_VIDEO_JOB_ID;
    const { rows } = await pool.query(
      \`select
        (select count(*)::int from storyboard_shots where workspace_id = $1) as "shotCount",
        (select count(*)::int from image_generation_batches where workspace_id = $1) as "imageBatchCount",
        (select count(distinct shot_id)::int from image_generation_batches where workspace_id = $1) as "imageBatchShotCount",
        (select count(*)::int from video_generation_batches where workspace_id = $1) as "videoBatchCount",
        (select count(distinct shot_id)::int from video_generation_batches where workspace_id = $1) as "videoBatchShotCount",
        (select count(*)::int from selected_shot_images ssi join storyboard_shots ss on ss.id = ssi.shot_id where ss.workspace_id = $1) as "selectedImageCount",
        (select count(*)::int from selected_shot_videos ssv join storyboard_shots ss on ss.id = ssv.shot_id where ss.workspace_id = $1) as "selectedVideoCount",
        (select coalesce(array_length(source_shot_video_ids, 1), 0)::int from final_video_jobs where id = $2) as "finalSourceVideoCount"\`,
      [workspaceId, finalVideoJobId],
    );
    await pool.end();
    process.stdout.write(JSON.stringify(rows[0]));
  `;

  const result = runSync(
    "pnpm",
    ["--filter", "@aigc-video/server", "exec", "node", "--input-type=module", "-e", code],
    {
      encoding: "utf8",
      stdio: "pipe",
      env: {
        ...process.env,
        REALITEST_WORKSPACE_ID: workspaceId,
        REALITEST_FINAL_VIDEO_JOB_ID: finalVideoJobId
      }
    }
  );

  const stdout = result.stdout.trim();
  const jsonStart = stdout.lastIndexOf("{");
  assert(jsonStart >= 0, `DB audit did not return JSON: ${stdout}`);
  const audit = JSON.parse(stdout.slice(jsonStart));
  assert(audit.shotCount >= fixedShotCount, "DB shot count must be at least 4");
  assert(
    audit.imageBatchCount >= audit.shotCount &&
      audit.imageBatchShotCount >= audit.shotCount,
    "DB image batch count must cover every shot"
  );
  assert(
    audit.videoBatchCount >= audit.shotCount &&
      audit.videoBatchShotCount >= audit.shotCount,
    "DB video batch count must cover every shot"
  );
  assert(
    audit.selectedImageCount === audit.shotCount,
    "DB selected image count must equal shot count"
  );
  assert(
    audit.selectedVideoCount === audit.shotCount,
    "DB selected video count must equal shot count"
  );
  assert(
    audit.finalSourceVideoCount === audit.selectedVideoCount,
    "final compose input video count must equal selected video shot count"
  );
  return audit;
}

async function runParallelFlow(input) {
  const { baseUrl, workspaceDirectory, workspaceName, materialRef } = input;
  const startedAt = Date.now();
  const summary = {
    workspaceId: null,
    shots: [],
    images: [],
    videos: [],
    finalVideoJobId: null,
    audit: null
  };

  console.log("Creating workspace...");
  const created = await requestJson(baseUrl, "POST", "/api/workspaces", {
    name: workspaceName
  });
  const workspaceId = created.workspace?.id;
  assert(workspaceId, "workspace creation response missing workspace.id");
  summary.workspaceId = workspaceId;

  await requestJson(baseUrl, "POST", `/api/workspaces/${workspaceId}/storage/bind`, {
    kind: "local",
    localPath: workspaceDirectory
  });
  await ensureMaterialAvailable(baseUrl, workspaceId, workspaceDirectory, materialRef);

  console.log("Approving fixed brief and fixed 4-shot storyboard...");
  await requestJson(baseUrl, "POST", "/api/workspaces/material-intake", {
    workspaceId,
    prompt: "Parallel realitest material intake.",
    selectedMaterialRefs: [materialRef]
  });
  await requestJson(baseUrl, "POST", "/api/workspaces/artifacts/brief/approve", {
    workspaceId,
    data: fixedBrief(materialRef)
  });

  const storyboard = fixedStoryboard(materialRef);
  validateStoryboard(storyboard);
  await requestJson(baseUrl, "POST", "/api/workspaces/artifacts/storyboard/approve", {
    workspaceId,
    data: storyboard
  });

  console.log("Compiling shotprompt from the approved 4-shot storyboard...");
  const compiled = await requestJson(
    baseUrl,
    "POST",
    "/api/workspaces/shotprompt/compile",
    { workspaceId, aspectRatio: "9:16" }
  );
  const compiledShotPrompt = compiled.artifact?.data;
  validateShotPrompt(compiledShotPrompt, storyboard);

  const shotPromptSource = process.env.REALITEST_PARALLEL_SHOTPROMPT_SOURCE ?? "compiled";
  assert(
    ["compiled", "fixed"].includes(shotPromptSource),
    "REALITEST_PARALLEL_SHOTPROMPT_SOURCE must be compiled or fixed"
  );
  const approvedShotPrompt =
    shotPromptSource === "fixed" ? fixedShotPrompt(storyboard) : compiledShotPrompt;
  validateShotPrompt(approvedShotPrompt, storyboard);
  await requestJson(baseUrl, "POST", "/api/workspaces/artifacts/shotprompt/approve", {
    workspaceId,
    data: approvedShotPrompt
  });

  const shotsResponse = await requestJson(
    baseUrl,
    "GET",
    `/api/workspaces/${workspaceId}/shots`
  );
  const shots = [...(shotsResponse.data ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  assert(
    shots.length === fixedShotCount,
    `GET /shots must return ${fixedShotCount} shots`
  );
  summary.shots = shots.map((shot) => ({ id: shot.id, orderIndex: shot.orderIndex }));

  console.log("Generating and selecting images shot-by-shot...");
  for (const shot of shots) {
    const shotStartedAt = Date.now();
    const proposed = await requestJson(
      baseUrl,
      "POST",
      `/api/workspaces/${workspaceId}/shots/${shot.id}/image-prompts/propose`,
      { userDirection: "保持商品外观一致，画面干净真实。" }
    );
    const batchId = batchIdFromPropose(proposed);
    assert(
      proposed.artifact?.id,
      `shot ${shot.orderIndex} image prompt artifact missing`
    );
    assert(batchId, `shot ${shot.orderIndex} image batch id missing`);
    const round = await pollSucceededRound(baseUrl, workspaceId, shot, "image", batchId);
    const candidate = round.succeededCandidates[0];
    assertStableWorkspaceUrl(
      workspaceId,
      candidate.imageUrl,
      `shot ${shot.orderIndex} image candidate`
    );
    const selection = await requestJson(
      baseUrl,
      "POST",
      `/api/workspaces/${workspaceId}/shots/${shot.id}/image-candidates/select`,
      {
        imageCandidateId: candidate.id,
        imageGenerationBatchId: round.batch.id
      }
    );
    assert(
      selection.selectedCandidateId === candidate.id,
      "image selection candidate mismatch"
    );
    summary.images.push({
      shotId: shot.id,
      orderIndex: shot.orderIndex,
      artifactId: proposed.artifact.id,
      batchId: round.batch.id,
      candidateId: candidate.id,
      elapsedMs: Date.now() - shotStartedAt
    });
    console.log(
      `  image shot ${shot.orderIndex}: ${stageSeconds("done in", shotStartedAt)}`
    );
  }

  const imageStatus = await requestJson(
    baseUrl,
    "GET",
    `/api/workspaces/${workspaceId}/shot-workflow-status`
  );
  assert(
    imageStatus.data?.shots?.every((shot) => Boolean(shot.selectedImageId)),
    "all shots must complete image selection"
  );

  console.log("Generating video scripts and candidates concurrently...");
  const videoSettled = await Promise.allSettled(
    shots.map(async (shot) => {
      const shotStartedAt = Date.now();
      const proposed = await requestJson(
        baseUrl,
        "POST",
        `/api/workspaces/${workspaceId}/shots/${shot.id}/video-scripts/propose`,
        { userDirection: "运镜自然，保持前后镜头连续，避免水印和乱码。" }
      );
      const batchId = batchIdFromPropose(proposed);
      assert(
        proposed.artifact?.id,
        `shot ${shot.orderIndex} video script artifact missing`
      );
      assert(batchId, `shot ${shot.orderIndex} video batch id missing`);
      const round = await pollSucceededRound(
        baseUrl,
        workspaceId,
        shot,
        "video",
        batchId
      );
      const candidate = round.succeededCandidates[0];
      assertStableWorkspaceUrl(
        workspaceId,
        candidate.videoUrl,
        `shot ${shot.orderIndex} video candidate`
      );
      return {
        shot,
        proposed,
        round,
        candidate,
        elapsedMs: Date.now() - shotStartedAt
      };
    })
  );
  const videoResults = await assertAllFulfilled(
    "parallel video generation",
    videoSettled
  );

  console.log("Selecting videos concurrently...");
  const selectVideoSettled = await Promise.allSettled(
    videoResults.map(async (result) => {
      const selection = await requestJson(
        baseUrl,
        "POST",
        `/api/workspaces/${workspaceId}/shots/${result.shot.id}/video-candidates/select`,
        {
          videoCandidateId: result.candidate.id,
          videoGenerationBatchId: result.round.batch.id
        }
      );
      assert(
        selection.selectedCandidateId === result.candidate.id,
        "video selection candidate mismatch"
      );
      return {
        shotId: result.shot.id,
        orderIndex: result.shot.orderIndex,
        artifactId: result.proposed.artifact.id,
        batchId: result.round.batch.id,
        candidateId: result.candidate.id,
        elapsedMs: result.elapsedMs
      };
    })
  );
  summary.videos = await assertAllFulfilled(
    "parallel video selection",
    selectVideoSettled
  );

  const videoStatus = await requestJson(
    baseUrl,
    "GET",
    `/api/workspaces/${workspaceId}/shot-workflow-status`
  );
  assert(
    videoStatus.data?.shots?.every((shot) => Boolean(shot.selectedVideoId)),
    "all shots must complete video selection"
  );
  assert(
    videoStatus.data?.canComposeFinalVideo === true,
    "final compose should be unlocked"
  );

  console.log("Creating final compose job and checking 4 selected source videos...");
  const finalCreated = await requestJson(
    baseUrl,
    "POST",
    `/api/workspaces/${workspaceId}/final-videos`,
    { outputAspectRatio: "9:16" },
    { "Idempotency-Key": `realitest-parallel:${workspaceId}:${Date.now()}` }
  );
  const finalVideoJobId = finalCreated.data?.finalVideoJobId;
  assert(finalVideoJobId, "final compose response missing finalVideoJobId");
  summary.finalVideoJobId = finalVideoJobId;
  const finalJob = await pollFinalJob(baseUrl, finalVideoJobId);
  assert(
    Array.isArray(finalJob.sourceShotVideoIds) &&
      finalJob.sourceShotVideoIds.length === fixedShotCount,
    "final compose input must contain 4 selected videos"
  );
  assertStableWorkspaceUrl(workspaceId, finalJob.localUrl, "final video");

  console.log("Running review, trace, and DB audit gates...");
  const [reviewAudit, traceAudit, dbAudit] = await Promise.all([
    scanReviewGate(workspaceDirectory),
    scanTraceGate(baseUrl, workspaceDirectory, workspaceId),
    runDbAudit(workspaceId, finalVideoJobId)
  ]);
  summary.audit = { review: reviewAudit, trace: traceAudit, db: dbAudit };
  summary.elapsedMs = Date.now() - startedAt;
  return summary;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(usage());
    return;
  }

  loadDotEnv(repoRoot);
  const workspaceDirectory = assertSafeWorkspaceDirectory(
    process.env.REALITEST_WORKSPACE_DIRECTORY ??
      (await resolvePostmanVariable("workspaceDirectory"))
  );
  const baseUrl =
    process.env.REALITEST_BASE_URL ??
    (await resolvePostmanVariable("baseUrl")) ??
    "http://localhost:3000";
  const workspaceName =
    process.env.REALITEST_PARALLEL_WORKSPACE_NAME ?? "0530-realitest-parallel";
  const materialRef =
    process.env.REALITEST_MATERIAL_REF ??
    (await resolvePostmanVariable("materialRef")) ??
    "display_1.png";
  const parallelVideoBatchSize = Number(
    process.env.REALITEST_PARALLEL_VIDEO_BATCH_SIZE ?? 1
  );
  process.env.DEFAULT_VIDEO_BATCH_SIZE = String(parallelVideoBatchSize);
  process.env.AIGC_VIDEO_SKIP_ENV_FILE = "true";

  runSync("pnpm", ["reset:dev", "--", "--yes", "--no-dev"]);
  await resetWorkspaceFiles(workspaceDirectory);

  const devChild = startDev();
  await waitForHealth(baseUrl, devChild);
  const limits = await requestJson(baseUrl, "GET", "/api/config/limits");
  assert(
    limits.data?.defaultVideoBatchSize === parallelVideoBatchSize,
    `parallel dev server must use defaultVideoBatchSize=${parallelVideoBatchSize}`
  );

  const summary = await runParallelFlow({
    baseUrl,
    workspaceDirectory,
    workspaceName,
    materialRef
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        workspaceId: summary.workspaceId,
        shotCount: summary.shots.length,
        imageBatches: summary.images.map((item) => item.batchId),
        videoBatches: summary.videos.map((item) => item.batchId),
        finalVideoJobId: summary.finalVideoJobId,
        audit: summary.audit,
        elapsedSeconds: Math.round(summary.elapsedMs / 1000)
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopDev();
  });
