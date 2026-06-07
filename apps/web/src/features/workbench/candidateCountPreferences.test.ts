import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidateCountStorageKey,
  clampCandidateCount,
  readCandidateCountPreferences,
  writeCandidateCountPreference,
} from "./candidateCountPreferences.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("candidate count preferences", () => {
  it("stores image and video counts per workspace", () => {
    const storage = new MemoryStorage();
    writeCandidateCountPreference({
      storage,
      workspaceId: "ws-1",
      kind: "image",
      value: 4,
    });
    writeCandidateCountPreference({
      storage,
      workspaceId: "ws-1",
      kind: "video",
      value: 2,
    });

    assert.deepEqual(readCandidateCountPreferences(storage, "ws-1"), {
      image: 4,
      video: 2,
    });
    assert.equal(
      storage.getItem(candidateCountStorageKey("ws-2")),
      null,
    );
  });

  it("clamps counts against latest limits", () => {
    assert.equal(clampCandidateCount({ value: 9, fallback: 3, max: 6 }), 6);
    assert.equal(clampCandidateCount({ value: 0, fallback: 3, max: 6 }), 1);
    assert.equal(clampCandidateCount({ value: undefined, fallback: 3, max: 6 }), 3);
  });

  it("ignores invalid stored JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem(candidateCountStorageKey("ws-1"), "{");

    assert.deepEqual(readCandidateCountPreferences(storage, "ws-1"), {});
  });
});
