#!/usr/bin/env tsx
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/db/client.js";
import { loadFixtureFromFile } from "./seed/fixture.js";
import { injectDashboardSeed, resetMockSeed } from "./seed/inject.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE = path.join(scriptDir, "fixtures/dashboard-seed.json");

interface Args {
  fixture: string;
  reset: boolean;
  workspace?: string;
}

function usage(): string {
  return [
    "Inject mock dashboard videos + KOL publications + daily metrics into the DB.",
    "",
    "Usage:",
    "  pnpm seed:dashboard:sample -- --reset",
    "  pnpm seed:dashboard:recommendation -- --reset",
    "  pnpm seed:dashboard -- --fixture <path> --workspace <id>",
    "",
    "Options:",
    "  --reset            Delete prior mock_* seed rows before inserting.",
    "  --fixture <path>   Fixture JSON (default: scripts/fixtures/dashboard-seed.json).",
    "  --workspace <id>   Override the workspace id from the fixture.",
    "  --help             Show this help text.",
  ].join("\n");
}

function parseArgs(argv: string[]): Args | { help: true } {
  const args = argv.filter((arg) => arg !== "--");
  let fixture = DEFAULT_FIXTURE;
  let reset = false;
  let workspace: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") return { help: true };
    else if (arg === "--reset") reset = true;
    else if (arg === "--fixture") fixture = path.resolve(args[++i] ?? "");
    else if (arg.startsWith("--fixture=")) {
      fixture = path.resolve(arg.slice("--fixture=".length));
    } else if (arg === "--workspace") workspace = args[++i];
    else if (arg.startsWith("--workspace=")) {
      workspace = arg.slice("--workspace=".length);
    } else throw new Error(`Unknown option "${arg}".\n\n${usage()}`);
  }
  return { fixture, reset, workspace };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ("help" in parsed) {
    console.log(usage());
    return;
  }

  await db.initialize();
  try {
    const fixture = await loadFixtureFromFile(parsed.fixture);
    const workspaceId = parsed.workspace ?? fixture.workspace.id;

    if (parsed.reset) {
      await resetMockSeed();
      console.log("Cleared prior mock_* seed rows.");
    }

    const summary = await injectDashboardSeed(fixture, { workspaceId });
    console.log("Dashboard seed complete:");
    console.log(`  fixture:           ${parsed.fixture}`);
    console.log(`  workspace:         ${summary.workspaceId}`);
    console.log(`  videos:            ${summary.videos}`);
    console.log(`  publications:      ${summary.publications}`);
    console.log(`  metric snapshots:  ${summary.metricSnapshots}`);
    console.log(`  dashboard ids:     ${summary.dashboardArtifactIds.join(", ")}`);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
