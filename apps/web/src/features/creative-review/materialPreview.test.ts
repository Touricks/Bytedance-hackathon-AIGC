import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveImagePreviewMode,
  deriveMaterialPreviewMode,
  materialPreviewModeLabel,
} from "./materialPreview.js";

describe("deriveImagePreviewMode", () => {
  it("supports 9:16, 16:9, and 1:1 image previews", () => {
    assert.equal(deriveImagePreviewMode(1080, 1920), "portrait");
    assert.equal(deriveImagePreviewMode(1920, 1080), "landscape");
    assert.equal(deriveImagePreviewMode(1200, 1200), "square");
  });

  it("falls back unsupported image dimensions to 16:9", () => {
    assert.equal(deriveImagePreviewMode(800, 1200), "landscape");
    assert.equal(deriveImagePreviewMode(1200, 800), "landscape");
    assert.equal(deriveImagePreviewMode(0, 1200), "landscape");
  });
});

describe("deriveMaterialPreviewMode", () => {
  it("uses a unified cover for non-image materials", () => {
    assert.equal(
      deriveMaterialPreviewMode({ kind: "video", width: 1080, height: 1920 }),
      "file",
    );
    assert.equal(
      deriveMaterialPreviewMode({ kind: "text", width: 1200, height: 1200 }),
      "file",
    );
  });
});

describe("materialPreviewModeLabel", () => {
  it("turns preview modes into user-facing labels", () => {
    assert.equal(materialPreviewModeLabel("portrait"), "9:16");
    assert.equal(materialPreviewModeLabel("landscape"), "16:9");
    assert.equal(materialPreviewModeLabel("square"), "1:1");
    assert.equal(materialPreviewModeLabel("file"), "文件");
  });
});
