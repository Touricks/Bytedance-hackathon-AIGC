import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import { buildShotPromptPrompt } from "./shotprompt.prompt.js";

const material: MaterialIntakeArtifact = {
  scannedAt: "2026-06-02T00:00:00.000Z",
  primaryProductRef: "product.jpg",
  assets: [
    {
      ref: "product.jpg",
      kind: "image",
      mime: "image/jpeg",
      bytes: 100,
      sha256: "a".repeat(64),
      role: "product_main",
      description: "商品主图",
      relevance: "high",
      usable: true,
      included: true,
    },
  ],
  rejected: [],
};

const brief: ProductBriefArtifact = {
  product: {
    name: "高端保温杯",
    category: "日用品",
    keyFacts: ["不锈钢材质"],
    assets: [{ ref: "product.jpg", useAs: "primary" }],
  },
  audience: {
    who: "通勤人群",
    painOrDesire: "希望饮水方便且有质感",
  },
  coreSellingPoint: "长效保温且外观精致",
  proof: ["商品主图展示金属材质。"],
  offer: null,
  platform: "抖音",
  brandTone: "专业可信",
  bannedExpressions: [],
  landingInfo: null,
  assumptions: [],
};

const storyboard: StoryboardArtifact = {
  narrative: "展示保温杯的外观、细节和使用价值。",
  totalDurationSec: 15,
  shots: [
    {
      index: 0,
      purpose: "hook",
      durationSec: 5,
      scene: "桌面上展示保温杯整体外观",
      visualDirection: "稳定近景拍摄杯身轮廓",
      productAssetRef: "product.jpg",
      voiceover: "这只杯子很适合通勤",
      transition: "硬切",
    },
  ],
  assumptions: [],
};

describe("buildShotPromptPrompt", () => {
  it("injects approved creative requirements at the top of shotprompt runtime context", () => {
    const prompt = buildShotPromptPrompt({
      brief,
      material,
      storyboard,
      aspectRatio: "9:16",
      creativeRequirements: {
        image: {
          style: "高端商业产品摄影",
          composition: "主体稳定居中",
          avoid: ["文字贴片", "商品变形"],
          ignoredImageField: "不应进入 prompt",
        },
        script: { tone: "克制、专业" },
        storyboard: { rhythm: "慢速展示细节" },
        shotImage: { global: "统一高端光线" },
        shotVideo: { global: "慢速稳定运镜" },
        ignoredSection: { value: "不应进入 prompt" },
      },
    });

    const runtimeIndex = prompt.indexOf("## Runtime Context");
    const requirementsIndex = prompt.indexOf("已批准创作要求（导演约束）：");
    const inputIndex = prompt.indexOf("输入：");
    const aspectRatioIndex = prompt.indexOf("画幅比例：9:16");

    assert.ok(runtimeIndex >= 0);
    assert.ok(requirementsIndex > runtimeIndex);
    assert.ok(inputIndex > requirementsIndex);
    assert.ok(aspectRatioIndex > inputIndex);
    assert.match(prompt, /- 图像风格：高端商业产品摄影/);
    assert.match(prompt, /- 图像构图：主体稳定居中/);
    assert.match(prompt, /- 图像避免项：文字贴片，商品变形/);
    assert.match(prompt, /- 剧本语气：克制、专业/);
    assert.match(prompt, /- 分镜节奏：慢速展示细节/);
    assert.match(prompt, /- 分镜图全局要求：统一高端光线/);
    assert.match(prompt, /- 分镜视频全局要求：慢速稳定运镜/);
    assert.equal(prompt.includes("不应进入 prompt"), false);
  });
});
