#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const requireFromServer = createRequire(
  new URL("../apps/server/package.json", import.meta.url)
);
const IORedis = requireFromServer("ioredis");

const queueNames = ["generation", "generation_v2"];

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
    readFileSync(envPath, "utf8").split(/\r?\n/).map(parseDotEnvLine).filter(Boolean)
  );
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  if (args.includes("--help")) {
    console.log("Usage: pnpm redis:clear -- --yes");
    process.exit(0);
  }
  return { yes: args.includes("--yes") };
}

async function scanKeys(redis, pattern) {
  const keys = [];
  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoEnv = loadRepoEnv();
  const redisUrl = process.env.REDIS_URL || repoEnv.REDIS_URL || "redis://localhost:6379";
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  try {
    const keys = [
      ...new Set(
        (await Promise.all(queueNames.map((name) => scanKeys(redis, `bull:${name}:*`)))).flat()
      )
    ];
    console.log(`Target Redis: ${redisUrl.replace(/:[^:@/]+@/, ":<redacted>@")}`);
    console.log(`BullMQ keys matched: ${keys.length}`);
    for (const name of queueNames) {
      console.log(`  bull:${name}:*`);
    }
    if (!args.yes) {
      console.log("Dry-run only. Re-run with --yes to delete these keys.");
      return;
    }
    for (let i = 0; i < keys.length; i += 500) {
      const batch = keys.slice(i, i + 500);
      if (batch.length) await redis.del(...batch);
    }
    console.log("Redis queue cleanup complete.");
  } finally {
    await redis.quit();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
