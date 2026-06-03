import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ShotStatus } from "./api/client.js";
import { SHOT_STATUS_LABELS, shotStatusLabel } from "./shotStatusLabel.js";

const expectedLabels: Record<ShotStatus, string> = {
  DRAFT: "草稿",
  IMAGE_PROMPT_PROPOSING: "图稿提议",
  IMAGE_PROMPT_READY: "图稿已就绪",
  IMAGE_PROMPT_EDITED: "图稿已编辑",
  IMAGE_GENERATING: "分镜图正在生成",
  IMAGE_CANDIDATES_READY: "分镜图待选择",
  IMAGE_SELECTED: "分镜图已选择",
  VIDEO_SCRIPT_PROPOSING: "视频稿提议",
  VIDEO_SCRIPT_READY: "视频稿已就绪",
  VIDEO_SCRIPT_EDITED: "视频稿已编辑",
  VIDEO_GENERATING: "视频正在生成",
  VIDEO_CANDIDATES_READY: "视频待选择",
  VIDEO_SELECTED: "视频已选择",
  FAILED: "失败",
};

describe("shotStatusLabel", () => {
  it("maps every shot workflow status to the requested Chinese label", () => {
    assert.deepEqual(SHOT_STATUS_LABELS, expectedLabels);
  });

  it("does not leak raw workflow status names to the UI", () => {
    for (const status of Object.keys(expectedLabels) as ShotStatus[]) {
      const label = shotStatusLabel(status);
      assert.equal(label, expectedLabels[status]);
      assert.doesNotMatch(label, /[A-Z_]/);
      assert.doesNotMatch(label, /Prompt/i);
    }
  });

  it("uses a neutral fallback for unknown statuses", () => {
    assert.equal(shotStatusLabel("UNKNOWN_STATUS"), "未知");
    assert.equal(shotStatusLabel(null), "未知");
  });
});
