import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OneClickFinalVideoJob } from "../../lib/api/oneClickFinalVideo.js";
import { resolveOneClickFinalVideoState } from "./oneClickState.js";

function oneClickJob(
  overrides: Partial<OneClickFinalVideoJob> = {},
): OneClickFinalVideoJob {
  return {
    id: "ocv_1",
    workspaceId: "ws_1",
    status: "RUNNING",
    currentStage: "image_selection",
    stageState: {},
    materialIntakeArtifactId: "art_material",
    productBriefArtifactId: null,
    storyboardArtifactId: null,
    shotPromptArtifactId: null,
    shotSetId: null,
    finalVideoJobId: null,
    autoSelectionStrategy: "first_success",
    outputAspectRatio: "9:16",
    errorCode: null,
    errorMessage: null,
    idempotencyKey: "idem_1",
    createdAt: "2026-06-04T16:03:22.000Z",
    updatedAt: "2026-06-04T16:10:00.000Z",
    startedAt: "2026-06-04T16:03:22.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("resolveOneClickFinalVideoState", () => {
  it("lets a terminal job list record override a stale active workspace summary", () => {
    const staleStatusJob = oneClickJob({
      status: "RUNNING",
      currentStage: "image_selection",
      updatedAt: "2026-06-04T16:10:00.000Z",
    });
    const completedListJob = oneClickJob({
      status: "SUCCEEDED",
      currentStage: "completed",
      finalVideoJobId: "fnl_1",
      updatedAt: "2026-06-04T16:19:50.000Z",
      completedAt: "2026-06-04T16:19:50.000Z",
    });

    const state = resolveOneClickFinalVideoState({
      statusActiveJob: staleStatusJob,
      jobs: [completedListJob],
      mutationPending: false,
    });

    assert.equal(state.hasActiveJob, false);
    assert.equal(state.activeJob, null);
    assert.equal(state.displayJob?.status, "SUCCEEDED");
    assert.equal(state.displayJob?.finalVideoJobId, "fnl_1");
  });

  it("keeps an active workspace summary when no terminal record has arrived", () => {
    const runningJob = oneClickJob();

    const state = resolveOneClickFinalVideoState({
      statusActiveJob: runningJob,
      jobs: [],
      mutationPending: false,
    });

    assert.equal(state.hasActiveJob, true);
    assert.equal(state.activeJob?.status, "RUNNING");
    assert.equal(state.displayJob?.currentStage, "image_selection");
  });
});
