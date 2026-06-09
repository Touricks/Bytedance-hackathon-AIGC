import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OneClickFinalVideoJob } from "../../lib/api/oneClickFinalVideo.js";
import {
  oneClickPollingInterval,
  resolveOneClickFinalVideoState,
  workspaceStatusRefetchInterval,
} from "./oneClickState.js";

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

describe("oneClickPollingInterval", () => {
  it("polls every 5 seconds when the workspace summary has an active job", () => {
    assert.equal(
      oneClickPollingInterval({
        statusActiveJob: oneClickJob({ status: "WAITING" }),
        jobs: [],
      }),
      5_000,
    );
  });

  it("polls every 5 seconds when the job list has an active job", () => {
    assert.equal(
      oneClickPollingInterval({
        statusActiveJob: null,
        jobs: [oneClickJob({ status: "RUNNING" })],
      }),
      5_000,
    );
  });

  it("polls every 15 seconds when there is no active one-click job", () => {
    assert.equal(
      oneClickPollingInterval({
        statusActiveJob: null,
        jobs: [oneClickJob({ status: "SUCCEEDED", currentStage: "completed" })],
      }),
      15_000,
    );
  });
});

describe("workspaceStatusRefetchInterval", () => {
  it("polls workspace status while a one-click job is active", () => {
    for (const status of ["PENDING", "RUNNING", "WAITING"] as const) {
      assert.equal(
        workspaceStatusRefetchInterval({
          activeOneClickFinalVideo: oneClickJob({ status }),
        }),
        3_000,
      );
    }
  });

  it("stops polling once the one-click job is terminal", () => {
    assert.equal(
      workspaceStatusRefetchInterval({
        activeOneClickFinalVideo: oneClickJob({
          status: "SUCCEEDED",
          currentStage: "completed",
        }),
      }),
      false,
    );
  });

  it("does not poll when no one-click job is active", () => {
    assert.equal(
      workspaceStatusRefetchInterval({ activeOneClickFinalVideo: null }),
      false,
    );
    assert.equal(
      workspaceStatusRefetchInterval({ activeOneClickFinalVideo: undefined }),
      false,
    );
  });
});
