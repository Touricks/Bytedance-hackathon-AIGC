import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canConfirmSelection,
  isSelectableCandidate,
  stageCandidate,
} from "./imageSelection.js";

const candidates = [
  { id: "imc_pending", status: "PENDING" as const },
  { id: "imc_ready", status: "SUCCEEDED" as const },
  { id: "imc_ready_2", status: "SUCCEEDED" as const },
  { id: "imc_failed", status: "FAILED" as const },
];

describe("isSelectableCandidate", () => {
  it("only a SUCCEEDED candidate can be staged", () => {
    assert.equal(isSelectableCandidate("SUCCEEDED"), true);
    assert.equal(isSelectableCandidate("PENDING"), false);
    assert.equal(isSelectableCandidate("RUNNING"), false);
    assert.equal(isSelectableCandidate("FAILED"), false);
    assert.equal(isSelectableCandidate("REJECTED"), false);
  });
});

describe("stageCandidate", () => {
  it("stages a clicked SUCCEEDED candidate", () => {
    assert.equal(stageCandidate(null, "imc_ready", candidates), "imc_ready");
    assert.equal(stageCandidate("imc_ready", "imc_ready_2", candidates), "imc_ready_2");
  });

  it("ignores clicks on candidates that are not yet ready", () => {
    assert.equal(stageCandidate("imc_ready", "imc_pending", candidates), "imc_ready");
    assert.equal(stageCandidate(null, "imc_failed", candidates), null);
  });

  it("ignores clicks on unknown candidate ids", () => {
    assert.equal(stageCandidate("imc_ready", "imc_missing", candidates), "imc_ready");
  });
});

describe("canConfirmSelection", () => {
  it("cannot confirm when nothing is staged", () => {
    assert.equal(
      canConfirmSelection({ stagedId: null, committedId: null, busy: false }),
      false,
    );
  });

  it("cannot confirm while a request is in flight", () => {
    assert.equal(
      canConfirmSelection({ stagedId: "imc_ready", committedId: null, busy: true }),
      false,
    );
  });

  it("cannot re-confirm the already committed selection", () => {
    assert.equal(
      canConfirmSelection({
        stagedId: "imc_ready",
        committedId: "imc_ready",
        busy: false,
      }),
      false,
    );
  });

  it("can confirm a fresh staged candidate that is not busy", () => {
    assert.equal(
      canConfirmSelection({ stagedId: "imc_ready", committedId: null, busy: false }),
      true,
    );
    assert.equal(
      canConfirmSelection({
        stagedId: "imc_ready_2",
        committedId: "imc_ready",
        busy: false,
      }),
      true,
    );
  });
});
