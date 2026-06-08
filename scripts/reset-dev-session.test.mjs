import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  campaignTempWorkspaceDirs,
  cleanupCampaignTempWorkspaces,
} from "./reset-dev-session.mjs";

const roots = [];

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "reset-dev-session-test-"));
  roots.push(root);
  return root;
}

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("reset dev session campaign temp workspace cleanup", () => {
  it("removes only immediate daireel-campaign temp directories", async () => {
    const root = await tempRoot();
    const rootRealPath = await realpath(root);
    const campaignDir = path.join(rootRealPath, "daireel-campaign-abc123");
    const dashboardDir = path.join(rootRealPath, "daireel-dashboard-abc123");
    const nestedParent = path.join(rootRealPath, "nested");
    const nestedCampaignDir = path.join(nestedParent, "daireel-campaign-nested");

    await mkdir(campaignDir);
    await mkdir(dashboardDir);
    await mkdir(nestedCampaignDir, { recursive: true });
    try {
      await symlink(dashboardDir, path.join(root, "daireel-campaign-symlink"));
    } catch {
      // Some filesystems do not allow symlink creation in test sandboxes.
    }

    assert.deepEqual(campaignTempWorkspaceDirs(root), [campaignDir]);

    cleanupCampaignTempWorkspaces(root);

    assert.deepEqual(campaignTempWorkspaceDirs(root), []);
    await assert.rejects(access(campaignDir));
    await assert.doesNotReject(access(dashboardDir));
    await assert.doesNotReject(access(nestedCampaignDir));
  });
});
