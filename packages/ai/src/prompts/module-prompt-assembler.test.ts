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

  it("supports shot-level image and video prompt modules", () => {
    const imagePrompt = buildModulePrompt({
      moduleId: "image-prompt",
      runtimeContext: "shotImage dict: { productIdentity: true }",
    });
    const videoPrompt = buildModulePrompt({
      moduleId: "video-script",
      runtimeContext: "shotVideo dict: { motion: 'push_in' }",
    });

    assert.equal(imagePrompt.metadata.subjectTemplateId, "image-prompt/subject.md");
    assert.equal(imagePrompt.metadata.contractTemplateId, "image-prompt/contract.md");
    assert.match(imagePrompt.prompt, /shotImage dict/);
    assert.match(imagePrompt.metadata.subjectHash, /^[a-f0-9]{64}$/);

    assert.equal(videoPrompt.metadata.subjectTemplateId, "video-script/subject.md");
    assert.equal(videoPrompt.metadata.contractTemplateId, "video-script/contract.md");
    assert.match(videoPrompt.prompt, /shotVideo dict/);
    assert.match(videoPrompt.metadata.contractHash, /^[a-f0-9]{64}$/);
  });
});
