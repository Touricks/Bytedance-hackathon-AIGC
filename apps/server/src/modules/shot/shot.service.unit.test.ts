import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { db } from "../../db/client.js";
import { HttpError } from "../../common/errors.js";
import { traceService } from "../trace/trace.service.js";
import { shotSetService } from "../workspace/shot-set.service.js";
import { shotWorkflowService } from "./shot.service.js";

const db2Descriptor = Object.getOwnPropertyDescriptor(db, "db2");
const originalListActiveShots = shotSetService.listActiveShots;
const originalTraceRecord = traceService.record;

function patchDb2(fakeDb2: unknown) {
  Object.defineProperty(db, "db2", {
    configurable: true,
    value: fakeDb2,
  });
}

afterEach(() => {
  if (db2Descriptor) {
    Object.defineProperty(db, "db2", db2Descriptor);
  }
  shotSetService.listActiveShots = originalListActiveShots;
  traceService.record = originalTraceRecord;
});

describe("shotWorkflowService.selectVideo", () => {
  it("rejects PERSISTING candidates even when a temporary preview URL exists", async () => {
    shotSetService.listActiveShots = (async () => [
      {
        id: "shot-1",
        workspaceId: "ws-1",
        orderIndex: 0,
        selectedVideoId: null,
      },
    ]) as any;
    traceService.record = (async () => undefined) as any;
    patchDb2({
      getShot: async () => ({
        id: "shot-1",
        workspaceId: "ws-1",
        defaultDurationSec: 4,
      }),
      getVideoCandidate: async () => ({
        id: "vcd-persisting",
        batchId: "vbb-1",
        workspaceId: "ws-1",
        shotId: "shot-1",
        videoUrl: null,
        objectKey: null,
        durationSec: 4,
        providerResponse: {
          providerTemporaryUrl: "https://provider.example/video.mp4",
        },
        status: "PERSISTING",
        errorMessage: null,
      }),
      getVideoBatch: async () => ({
        id: "vbb-1",
        workspaceId: "ws-1",
        shotId: "shot-1",
      }),
      upsertSelectedVideo: async () => {
        throw new Error("must not select persisting candidate");
      },
      updateShot: async () => {
        throw new Error("must not update shot for persisting candidate");
      },
    });

    await assert.rejects(
      shotWorkflowService.selectVideo({
        workspaceId: "ws-1",
        shotId: "shot-1",
        videoCandidateId: "vcd-persisting",
        videoGenerationBatchId: "vbb-1",
      }),
      (error) =>
        error instanceof HttpError &&
        error.statusCode === 400 &&
        error.code === "CANNOT_SELECT_FAILED_CANDIDATE",
    );
  });
});
