#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const roots = ["apps/", "packages/", "docs/core/", "scripts/", "package.json"];
const ignoredPaths = new Set(["scripts/check-versioned-naming.mjs"]);
const ignoredPathPatterns = [
  /\/dist\//,
  /\/node_modules\//,
  /(^|\/)\.turbo\//,
];

const bannedPatterns = [
  {
    label: "standalone or suffixed v1/v2 token",
    pattern: /(^|[^A-Za-z0-9])v[12]([^A-Za-z0-9]|$)/i,
  },
  {
    label: "identifier containing V1/V2",
    pattern: /[A-Za-z0-9]V[12][A-Za-z0-9]/,
  },
];

function trackedAndUntrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
    encoding: "utf8",
  });
  return output.split(/\r?\n/).filter(Boolean);
}

function isInScope(filePath) {
  return (
    roots.some((root) => filePath === root || filePath.startsWith(root)) &&
    !ignoredPaths.has(filePath) &&
    !ignoredPathPatterns.some((pattern) => pattern.test(filePath))
  );
}

function isProbablyText(filePath) {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size > 2_000_000) return false;
    const sample = readFileSync(filePath).subarray(0, 4096);
    return !sample.includes(0);
  } catch {
    return false;
  }
}

function isAllowed(filePath, line) {
  if (/https?:\/\/\S*\/v[123]\b/i.test(line)) return true;
  if (/schema\.getpostman\.com\/json\/collection\/v2\.1\.0/.test(line)) return true;
  if (/ListObjectsV2Command/.test(line)) return true;
  if (/fnv1a/.test(line)) return true;
  if (filePath === "scripts/clear-redis.mjs" && /generation_v2/.test(line)) return true;
  if (
    filePath === "packages/shared/src/schemas/creative-factors.ts" &&
    /LEGACY_CREATIVE_TAGS_SCHEMA_VERSION|creative-tags\.v2|creativeTagsV2Schema|CreativeTagsV2/.test(
      line,
    )
  ) {
    return true;
  }
  return false;
}

const violations = [];
for (const filePath of trackedAndUntrackedFiles()) {
  if (!isInScope(filePath) || !isProbablyText(filePath)) continue;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isAllowed(filePath, line)) return;
    const match = bannedPatterns.find(({ pattern }) => pattern.test(line));
    if (match) {
      violations.push({
        filePath,
        lineNumber: index + 1,
        label: match.label,
        line: line.trim(),
      });
    }
  });
}

if (violations.length > 0) {
  console.error("Versioned naming guard failed. Use semantic names in main paths.");
  for (const violation of violations) {
    console.error(
      `${violation.filePath}:${violation.lineNumber} ${violation.label}: ${violation.line}`,
    );
  }
  process.exit(1);
}

console.log("Versioned naming guard passed.");
