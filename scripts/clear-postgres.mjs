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
const { Client } = requireFromServer("pg");

const tables = [
  "external_kol_metrics",
  "external_kol_publications",
  "dashboard_video_artifacts",
  "trace_events",
  "workspace_module_runs",
  "final_video_jobs",
  "generation_jobs",
  "video_select_artifacts",
  "selected_shot_videos",
  "video_candidates",
  "video_generation_batches",
  "video_script_artifacts",
  "image_select_artifacts",
  "selected_shot_images",
  "image_candidates",
  "image_generation_batches",
  "image_prompt_artifacts",
  "shot_asset_refs",
  "shot_prompt_requirements",
  "storyboard_shots",
  "shot_sets",
  "shot_prompt_artifacts",
  "storyboard_artifacts",
  "product_brief_artifacts",
  "material_intake_artifacts",
  "prompt_requirements_artifacts",
  "workspace_artifact",
  "script",
  "creative_workspace",
  "product",
  "asset"
];

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!key) {
    return null;
  }

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
  if (!existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(envPath, "utf8").split(/\r?\n/).map(parseDotEnvLine).filter(Boolean)
  );
}

function getDatabaseUrl() {
  const repoEnv = loadRepoEnv();
  const databaseUrl = process.env.DATABASE_URL || repoEnv.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Set it in the environment or repo root .env."
    );
  }
  return databaseUrl;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function formatDatabaseTarget(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const username = parsed.username ? decodeURIComponent(parsed.username) : "";
    const auth = username ? `${username}${parsed.password ? ":<redacted>" : ""}@` : "";
    return `${parsed.protocol}//${auth}${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

function usage() {
  return [
    "Usage:",
    "  pnpm db:clear",
    "  pnpm db:clear -- --yes",
    "",
    "Clears Postgres business tables only.",
    "Does not delete workspace .daireel/trace/events.jsonl or deprecated repo-local storage/trace.",
    "",
    "Options:",
    "  --yes   Execute the TRUNCATE. Without this flag the script is dry-run only.",
    "  --help  Show this help text."
  ].join("\n");
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const allowed = new Set(["--yes", "--help"]);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.join(", ")}\n\n${usage()}`);
  }

  return {
    yes: args.includes("--yes"),
    help: args.includes("--help")
  };
}

async function getExistingTables(client) {
  const result = await client.query(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
       and table_name = any($1::text[])`,
    [tables]
  );

  return new Set(result.rows.map((row) => row.table_name));
}

async function countRows(client) {
  const counts = {};
  const existingTables = await getExistingTables(client);
  for (const table of tables) {
    if (!existingTables.has(table)) {
      counts[table] = 0;
      continue;
    }
    const result = await client.query(
      `select count(*)::integer as count from ${quoteIdentifier(table)}`
    );
    counts[table] = result.rows[0].count;
  }
  return counts;
}

function printCounts(title, counts) {
  console.log(title);
  for (const table of tables) {
    console.log(`  ${table}: ${counts[table]}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const databaseUrl = getDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    console.log(`Target database: ${formatDatabaseTarget(databaseUrl)}`);

    const existingTables = await getExistingTables(client);
    const existingTablesToTruncate = tables.filter((table) =>
      existingTables.has(table)
    );
    const missingTables = tables.filter((table) => !existingTables.has(table));
    if (missingTables.length > 0) {
      console.log(
        `Skipping missing table(s), schema will create them on next server start: ${missingTables.join(", ")}`
      );
    }

    const beforeCounts = await countRows(client);
    printCounts("Rows before cleanup:", beforeCounts);

    if (!args.yes) {
      console.log("");
      console.log("Dry-run only. Re-run with --yes to clear these tables.");
      return;
    }

    await client.query("begin");
    try {
      await client.query(
        `truncate table ${existingTablesToTruncate.map(quoteIdentifier).join(", ")}
         restart identity cascade`
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    const afterCounts = await countRows(client);
    console.log("");
    printCounts("Rows after cleanup:", afterCounts);
    console.log("");
    console.log("Postgres cleanup complete.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
