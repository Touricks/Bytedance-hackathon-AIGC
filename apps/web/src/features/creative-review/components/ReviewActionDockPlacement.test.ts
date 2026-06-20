import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readLocalSource(filename: string) {
  return readFileSync(new URL(filename, import.meta.url), "utf8");
}

function assertLabelInsideDock(source: string, label: string) {
  const labelIndex = source.indexOf(label);
  assert.notEqual(labelIndex, -1, `expected ${label} to exist`);
  const dockStart = source.lastIndexOf("<ReviewActionDock", labelIndex);
  const dockEnd = source.indexOf("</ReviewActionDock>", labelIndex);
  assert.ok(dockStart >= 0, `expected ${label} to be after ReviewActionDock`);
  assert.ok(dockEnd > labelIndex, `expected ${label} to be inside ReviewActionDock`);
}

describe("ReviewActionDock placement", () => {
  it("keeps steps 3-5 final approval buttons inside the sticky dock", () => {
    assertLabelInsideDock(
      readLocalSource("ProductBriefReview.tsx"),
      "批准商品卖点并生成分镜脚本"
    );
    assertLabelInsideDock(readLocalSource("StoryboardReview.tsx"), "批准生效");
    assertLabelInsideDock(readLocalSource("ShotPromptReview.tsx"), "批准分镜生成要求");
  });

  it("keeps shot prompt local save actions in their form area", () => {
    const source = readLocalSource("ShotPromptReview.tsx");

    assert.match(
      source,
      /className="review-panel__actions review-business-form__wide"[\s\S]*保存全片要求/
    );
  });

  it("defines the shared dock as sticky and removes the old storyboard-only dock", () => {
    const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

    assert.match(
      styles,
      /\.review-panel\s*{[\s\S]*height:\s*calc\(100dvh - 96px\);/
    );
    assert.match(
      styles,
      /\.review-action-dock\s*{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;[\s\S]*margin-top:\s*auto;/
    );
    assert.doesNotMatch(styles, /storyboard-approve-dock/);
  });

  it("styles detailed creative factor labels with the requested hierarchy", () => {
    const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

    assert.match(
      styles,
      /\.creative-factor-group__title\s*{[\s\S]*font-size:\s*18px;[\s\S]*font-weight:\s*800;/
    );
    assert.match(
      styles,
      /\.creative-factor-field__label\s*{[\s\S]*font-size:\s*15\.5px;/
    );
  });

  it("keeps media result panels sized to content instead of stretching sparse rows", () => {
    const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

    assert.match(
      styles,
      /\.review-panel:has\(\.review-image-grid\)[\s\S]*?\.review-panel:has\(\.review-video-grid\)\s*{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*0;/
    );
    assert.match(
      styles,
      /\.review-panel:has\(\.review-image-grid\) \.review-round[\s\S]*?\.review-panel:has\(\.review-video-grid\) \.review-round\s*{[\s\S]*?width:\s*fit-content;/
    );
    assert.match(
      styles,
      /\.review-panel:has\(\.review-final\)\s*{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*0;/
    );
    assert.match(
      styles,
      /\.review-panel:has\(\.review-final\) \.review-final\s*{[\s\S]*?width:\s*min\(380px, 100%\);/
    );
    assert.match(
      styles,
      /\.review-final video\s*{[\s\S]*?aspect-ratio:\s*9 \/ 16;[\s\S]*?object-fit:\s*contain;/
    );
  });
});
