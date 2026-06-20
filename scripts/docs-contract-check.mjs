#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const headerFields = [
  "Status:",
  "Owner:",
  "Last Updated:",
  "Applies To:",
  "Depends On:",
  "Blocks:",
  "Decision State:",
];

const requiredMarkdown = [
  "docs/README.md",
  "docs/migrations/spec-kit-project-docs-migration-plan.md",
  "docs/decisions/ADR-0001-project-docs-ownership.md",
  "docs/ownership/team-ownership.md",
  "docs/ownership/change-policy.md",
  "docs/architecture/module-map.md",
  "docs/architecture/runtime-flow.md",
  "docs/contracts/interface.md",
  "docs/contracts/contract-mapping.md",
  "docs/contracts/state-machine.md",
  "docs/contracts/examples/README.md",
  "docs/contracts/postman/postman_newman.md",
  "docs/contracts/postman/fixtures/README.md",
  "docs/data/persistence-boundary.md",
  "docs/frontend/ui-governance.md",
  "docs/ai/retrieval-eval-boundary.md",
  "docs/eval/demo-eval-plan.md",
];

const requiredFiles = [
  ...requiredMarkdown,
  "docs/contracts/openapi.yaml",
  "docs/contracts/postman/postman_collection.json",
];

async function exists(filePath) {
  try {
    await stat(path.join(rootDir, filePath));
    return true;
  } catch {
    return false;
  }
}

async function readProjectFile(filePath) {
  return await readFile(path.join(rootDir, filePath), "utf8");
}

async function listFiles(dir) {
  const absDir = path.join(rootDir, dir);
  const entries = await readdir(absDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(rel)));
    } else {
      files.push(rel);
    }
  }
  return files;
}

function assertHeader(filePath, content) {
  const lines = content.split(/\r?\n/).slice(0, 12);
  assert.ok(lines[0]?.startsWith("# "), `${filePath} must start with a markdown title`);
  for (const field of headerFields) {
    assert.ok(lines.some((line) => line.startsWith(field)), `${filePath} missing header field ${field}`);
  }
}

for (const filePath of requiredFiles) {
  assert.ok(await exists(filePath), `${filePath} must exist`);
}

for (const filePath of requiredMarkdown) {
  const content = await readProjectFile(filePath);
  assertHeader(filePath, content);
  assert.equal(content.includes("{{"), false, `${filePath} still contains template placeholders`);
  assert.equal(content.includes("TODO("), false, `${filePath} still contains TODO placeholders`);
}

const canonicalOpenapi = await readProjectFile("docs/contracts/openapi.yaml");
const legacyOpenapi = await readProjectFile("docs/core/contracts/openapi.yaml");
assert.equal(
  canonicalOpenapi,
  legacyOpenapi,
  "docs/contracts/openapi.yaml must match the migration compatibility copy",
);

const contractCheck = await readProjectFile("scripts/frontend-backend-contract-check.mjs");
assert.ok(
  contractCheck.includes("docs/contracts/openapi.yaml"),
  "frontend/backend contract check must read docs/contracts/openapi.yaml",
);
assert.equal(
  contractCheck.includes("docs/core/contracts/openapi.yaml covers the frontend API surface"),
  false,
  "frontend/backend contract check must not name the legacy OpenAPI as canonical",
);

const canonicalDocs = (await listFiles("docs"))
  .filter((filePath) => filePath.endsWith(".md"))
  .filter((filePath) => !filePath.startsWith("docs/core/"))
  .filter((filePath) => !filePath.startsWith("docs/self-use/"));

for (const filePath of canonicalDocs) {
  const content = await readProjectFile(filePath);
  assert.equal(
    /Depends On:.*docs\/core/.test(content),
    false,
    `${filePath} must not depend on legacy core docs`,
  );
  assert.equal(
    /docs\/core\/.*source of truth/i.test(content),
    false,
    `${filePath} must not describe legacy core docs as source of truth`,
  );
  assert.equal(
    content.includes("current target API contract"),
    false,
    `${filePath} must not use the old current-target wording`,
  );
}

for (const optionalLocal of ["AGENTS.md", "CLAUDE.md"]) {
  if (!(await exists(optionalLocal))) continue;
  const content = await readProjectFile(optionalLocal);
  assert.equal(
    content.includes("current target API contract"),
    false,
    `${optionalLocal} must not describe docs/core as the current target API contract`,
  );
  assert.equal(
    content.includes("检查docs/core"),
    false,
    `${optionalLocal} must not require docs/core as the first update target`,
  );
}

console.log("docs contract check passed");
