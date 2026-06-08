import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildModulePrompt,
  getModulePromptAssemblyMetadata,
} from "./module-prompt-assembler.js";

describe("module prompt assembler", () => {
  it("assembles subject content separately from the schema contract", () => {
    const result = buildModulePrompt({
      moduleId: "storyboard",
      runtimeContext: "已确认素材清单：display_1.png",
    });

    assert.match(result.prompt, /## Subject Prompt/);
    assert.match(result.prompt, /## Runtime Context/);
    assert.match(result.prompt, /## Schema Contract/);
    assert.match(result.prompt, /已确认素材清单：display_1\.png/);
    assert.equal(result.metadata.subjectTemplateId, "storyboard/subject.md");
    assert.equal(result.metadata.contractTemplateId, "storyboard/contract.md");
    assert.notEqual(result.metadata.subjectHash, result.metadata.contractHash);
  });

  it("exposes stable prompt assembly metadata without runtime context", () => {
    const metadata = getModulePromptAssemblyMetadata("shotprompt");

    assert.equal(metadata.moduleId, "shotprompt");
    assert.equal(metadata.subjectTemplateId, "shotprompt/subject.md");
    assert.equal(metadata.contractTemplateId, "shotprompt/contract.md");
    assert.match(metadata.subjectHash, /^[a-f0-9]{64}$/);
    assert.match(metadata.contractHash, /^[a-f0-9]{64}$/);
  });

  it("documents providerPrompt shotImage and shotVideo as separate shotprompt layers", () => {
    const shotPrompt = buildModulePrompt({
      moduleId: "shotprompt",
      runtimeContext: "已确认分镜：商品开场",
    });

    assert.match(shotPrompt.prompt, /providerPrompt：镜头叙事和语境锚点/);
    assert.match(shotPrompt.prompt, /shotImage：静态关键帧要求/);
    assert.match(shotPrompt.prompt, /shotVideo：动态视频运动要求/);
    assert.match(shotPrompt.prompt, /禁止把 providerPrompt 原样复制/);
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

    assert.match(materialIntake.prompt, /role 分类规则/);
    assert.match(materialIntake.prompt, /spec_text/);
    assert.match(materialIntake.prompt, /只允许一张素材承担主商品身份/);

    assert.match(productBrief.prompt, /coreSellingPoint 写法规范/);
    assert.match(productBrief.prompt, /visualStyle 表达指导/);

    assert.match(storyboard.prompt, /strategy 叙事弧规则/);
    assert.match(storyboard.prompt, /visual-story/);
    assert.match(storyboard.prompt, /固定总时长 15 秒/);
    assert.match(storyboard.prompt, /purpose 必须按顺序严格是 hook、proof、cta/);
    assert.doesNotMatch(storyboard.prompt, /固定 6 个 shots|固定 6 个镜头|12 秒|durationSec \* 8/);

    assert.match(shotprompt.prompt, /providerPrompt 8 要素规则/);
    assert.match(shotprompt.prompt, /shotImage 规则/);
    assert.match(shotprompt.prompt, /shotVideo 规则/);
    assert.match(shotprompt.prompt, /pace 可为 slow、medium 或 fast/);
  });
});
