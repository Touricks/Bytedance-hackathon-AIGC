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
    assert.match(shotPrompt.prompt, /不得互相原样复制/);
  });
});
