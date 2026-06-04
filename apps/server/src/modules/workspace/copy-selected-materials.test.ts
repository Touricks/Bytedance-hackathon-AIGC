import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { copySelectedLegacyRootMaterials } from "./workspace.service.js";

const MATERIALS_SUBDIR = path.join(".daireel", "materials");

async function makeWorkspace() {
  const directory = await mkdtemp(path.join(tmpdir(), "ws-copy-mat-"));
  await mkdir(path.join(directory, MATERIALS_SUBDIR), { recursive: true });
  return directory;
}

// A "real" selected file is larger/different than a 1x1 placeholder squatter.
const realBytes = Buffer.alloc(2048, 7);
const placeholderBytes = Buffer.from([0x01]);

test("a selected bound-directory file overwrites a stale placeholder squatting the managed name", async () => {
  const directory = await makeWorkspace();
  try {
    await writeFile(path.join(directory, "display_1.png"), realBytes);
    await writeFile(
      path.join(directory, MATERIALS_SUBDIR, "display_1.png"),
      placeholderBytes,
    );

    await copySelectedLegacyRootMaterials({
      directory,
      selectedMaterialRefs: ["display_1.png"],
    });

    const managed = await readFile(
      path.join(directory, MATERIALS_SUBDIR, "display_1.png"),
    );
    assert.ok(
      managed.equals(realBytes),
      "managed file should now equal the selected bound-directory file",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("is idempotent when the managed file already matches the selected source", async () => {
  const directory = await makeWorkspace();
  try {
    await writeFile(path.join(directory, "display_1.png"), realBytes);
    await writeFile(
      path.join(directory, MATERIALS_SUBDIR, "display_1.png"),
      realBytes,
    );

    await copySelectedLegacyRootMaterials({
      directory,
      selectedMaterialRefs: ["display_1.png"],
    });

    const managed = await readFile(
      path.join(directory, MATERIALS_SUBDIR, "display_1.png"),
    );
    assert.ok(managed.equals(realBytes));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("leaves an uploaded-only managed file untouched when the bound directory has no such source", async () => {
  const directory = await makeWorkspace();
  try {
    // No root source; only a managed (previously uploaded) file exists.
    await writeFile(
      path.join(directory, MATERIALS_SUBDIR, "uploaded.png"),
      realBytes,
    );

    await copySelectedLegacyRootMaterials({
      directory,
      selectedMaterialRefs: ["uploaded.png"],
    });

    const managed = await readFile(
      path.join(directory, MATERIALS_SUBDIR, "uploaded.png"),
    );
    assert.ok(managed.equals(realBytes), "uploaded-only material must be kept");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
