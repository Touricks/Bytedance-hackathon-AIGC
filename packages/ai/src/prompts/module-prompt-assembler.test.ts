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

  it("keeps image-prompt instructions still-image only", () => {
    const imagePrompt = buildModulePrompt({
      moduleId: "image-prompt",
      runtimeContext: "shotImage dict: { scene: '商品在桌面上' }",
    });

    assert.match(imagePrompt.prompt, /静态图提示/);
    assert.match(imagePrompt.prompt, /单张关键帧/);
    assert.match(imagePrompt.prompt, /以 compiledShotRequirements 作为权威创作要求/);
    assert.match(imagePrompt.prompt, /完整的 shotImage 和 shotVideo 字典/);
    assert.match(imagePrompt.prompt, /镜头运动/);
    assert.match(imagePrompt.prompt, /时长/);
    assert.match(imagePrompt.prompt, /旁白/);
    assert.match(imagePrompt.prompt, /JSON null/);
    assert.match(imagePrompt.prompt, /简体中文/);
  });

  it("keeps video-script instructions motion-provider only", () => {
    const videoPrompt = buildModulePrompt({
      moduleId: "video-script",
      runtimeContext: "shotVideo dict: { cameraMotion: 'push_in' }",
    });

    assert.match(videoPrompt.prompt, /motion\/video provider prompt/);
    assert.match(videoPrompt.prompt, /Use shot\.shotVideo as the main creative requirement/);
    assert.match(videoPrompt.prompt, /first frame/);
    assert.match(videoPrompt.prompt, /ending frame/);
    assert.match(videoPrompt.prompt, /duration\/tempo/);
    assert.match(videoPrompt.prompt, /must not be copied as the final providerPrompt/);
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
