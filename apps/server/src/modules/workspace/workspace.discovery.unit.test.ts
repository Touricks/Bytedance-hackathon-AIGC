import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseInitWorkspaceId,
  filterUnregisteredDiscovered,
  parseDiscoveryRoots,
} from "./workspace.discovery.js";

describe("parseDiscoveryRoots", () => {
  it("returns an empty list when unset or blank", () => {
    assert.deepEqual(parseDiscoveryRoots(undefined), []);
    assert.deepEqual(parseDiscoveryRoots(""), []);
    assert.deepEqual(parseDiscoveryRoots("   "), []);
  });

  it("splits comma-separated roots and trims blanks", () => {
    assert.deepEqual(
      parseDiscoveryRoots("/a/drafts, /b/projects ,, /c "),
      ["/a/drafts", "/b/projects", "/c"],
    );
    assert.deepEqual(parseDiscoveryRoots("/only"), ["/only"]);
  });
});

describe("chooseInitWorkspaceId", () => {
  it("reuses the on-disk manifest id when it is free, so re-opening reconnects the original workspace", () => {
    assert.equal(
      chooseInitWorkspaceId({ manifestWorkspaceId: "VBuy2YQUO9cwRY42fdcy8", manifestIdInUse: false }),
      "VBuy2YQUO9cwRY42fdcy8",
    );
  });

  it("mints a new id (returns null) when the manifest id is already taken by another workspace", () => {
    assert.equal(
      chooseInitWorkspaceId({ manifestWorkspaceId: "VBuy2YQUO9cwRY42fdcy8", manifestIdInUse: true }),
      null,
    );
  });

  it("mints a new id (returns null) when there is no manifest id", () => {
    assert.equal(chooseInitWorkspaceId({ manifestWorkspaceId: null, manifestIdInUse: false }), null);
    assert.equal(chooseInitWorkspaceId({ manifestWorkspaceId: undefined, manifestIdInUse: false }), null);
  });
});

describe("filterUnregisteredDiscovered", () => {
  it("drops on-disk workspaces already registered in the DB", () => {
    const result = filterUnregisteredDiscovered(
      ["/p/IntegrationTest_v0/onePicture"],
      [
        { localPath: "/p/IntegrationTest_v0/onePicture", workspaceId: "OZ" },
        { localPath: "/p/IntegrationTest_current", workspaceId: "VBuy" },
      ],
    );
    assert.deepEqual(result, [{ localPath: "/p/IntegrationTest_current", workspaceId: "VBuy" }]);
  });

  it("deduplicates discovered entries by local path", () => {
    const result = filterUnregisteredDiscovered(
      [],
      [
        { localPath: "/p/a", workspaceId: "a1" },
        { localPath: "/p/a", workspaceId: "a1" },
        { localPath: "/p/b", workspaceId: "b1" },
      ],
    );
    assert.deepEqual(result, [
      { localPath: "/p/a", workspaceId: "a1" },
      { localPath: "/p/b", workspaceId: "b1" },
    ]);
  });
});
