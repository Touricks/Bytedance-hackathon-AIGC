import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildModulePrompt } from "./module-prompt-assembler.js";

describe("module prompt assembler", () => {
  it("assembles subject content separately from the schema contract", () => {
    const prompt = buildModulePrompt({
      moduleId: "storyboard",
      runtimeContext: "已确认素材清单：display_1.png",
    });

    assert.match(prompt, /## Subject Prompt/);
    assert.match(prompt, /## Runtime Context/);
    assert.match(prompt, /## Schema Contract/);
    assert.match(prompt, /已确认素材清单：display_1\.png/);
  });

  it("documents providerPrompt shotImage and shotVideo as separate shotprompt layers", () => {
    const shotPrompt = buildModulePrompt({
      moduleId: "shotprompt",
      runtimeContext: "已确认分镜：商品开场",
    });

    assert.match(shotPrompt, /providerPrompt：镜头叙事和语境锚点/);
    assert.match(shotPrompt, /shotImage：静态关键帧要求/);
    assert.match(shotPrompt, /shotVideo：动态视频运动要求/);
    assert.match(shotPrompt, /禁止把 providerPrompt 原样复制/);
  });

  it("loads subject creative rules for the four prompt modules", () => {
    const materialIntake = buildModulePrompt({
      moduleId: "material-intake",
      runtimeContext: "已验证素材清单：bag-main.png",
    });
    const productBrief = buildModulePrompt({
      moduleId: "product-brief",
      runtimeContext: "素材清点：箱包商品",
    });
    const storyboard = buildModulePrompt({
      moduleId: "storyboard",
      runtimeContext: "商品 brief：通勤包",
    });
    const shotprompt = buildModulePrompt({
      moduleId: "shotprompt",
      runtimeContext: "已确认分镜：3 个 shots",
    });

    assert.match(materialIntake, /role 分类规则/);
    assert.match(materialIntake, /spec_text/);
    assert.match(materialIntake, /只允许一张素材承担主商品身份/);

    assert.match(productBrief, /coreSellingPoint 写法规范/);
    assert.match(productBrief, /visualStyle 表达指导/);

    assert.match(storyboard, /strategy 叙事弧规则/);
    assert.match(storyboard, /visual-story/);
    assert.match(storyboard, /固定总时长 15 秒/);
    assert.match(storyboard, /purpose 必须按顺序严格是 hook、proof、cta/);
    assert.doesNotMatch(storyboard, /固定 6 个 shots|固定 6 个镜头|12 秒|durationSec \* 8/);

    assert.match(shotprompt, /providerPrompt 8 要素规则/);
    assert.match(shotprompt, /shotImage 规则/);
    assert.match(shotprompt, /shotVideo 规则/);
    assert.match(shotprompt, /pace 可为 slow、medium 或 fast/);
  });
});
