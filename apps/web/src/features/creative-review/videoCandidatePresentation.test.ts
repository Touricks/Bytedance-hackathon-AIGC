import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { videoCandidatePresentation } from "./videoCandidatePresentation.js";

describe("videoCandidatePresentation", () => {
  it("allows preview but disables selection while a video candidate is saving", () => {
    const view = videoCandidatePresentation(
      {
        id: "vcd-persisting",
        videoUrl: null,
        previewVideoUrl: "https://provider.example/video.mp4",
        thumbnailUrl: null,
        durationSec: 4,
        status: "PERSISTING",
        providerTaskId: "seedance-task-1",
        providerReadyAt: "2026-06-03T10:40:00.000Z",
        persistStatus: "PERSISTING",
        errorMessage: null,
      },
      true,
    );

    assert.equal(view.mediaUrl, "https://provider.example/video.mp4");
    assert.equal(view.statusText, "正在保存到工作目录");
    assert.equal(view.selectLabel, "正在保存到工作目录");
    assert.equal(view.canSelect, false);
    assert.equal(view.canFeedback, false);
  });

  it("allows selection and feedback only after a stable video URL exists", () => {
    const view = videoCandidatePresentation(
      {
        id: "vcd-succeeded",
        videoUrl: "/api/workspaces/ws-1/videos/vcd-succeeded.mp4",
        previewVideoUrl: "https://provider.example/video.mp4",
        thumbnailUrl: null,
        durationSec: 4,
        status: "SUCCEEDED",
        providerTaskId: "seedance-task-1",
        providerReadyAt: "2026-06-03T10:40:00.000Z",
        persistStatus: "SUCCEEDED",
        errorMessage: null,
      },
      true,
    );

    assert.equal(view.mediaUrl, "/api/workspaces/ws-1/videos/vcd-succeeded.mp4");
    assert.equal(view.statusText, "SUCCEEDED");
    assert.equal(view.canSelect, true);
    assert.equal(view.canFeedback, true);
  });
});
