import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSeedanceVideoExportPrompt,
  buildTwelveSecondVideoPrompt,
} from "./video.prompt.js";

function countOccurrences(input: string, pattern: string) {
  return input.split(pattern).length - 1;
}

describe("buildSeedanceVideoExportPrompt", () => {
  it("compiles approved shotprompt fields directly for V1 Seedance export", () => {
    const prompt = buildSeedanceVideoExportPrompt({
      shotPrompt: {
        targetProvider: "seedance",
        durationSec: 12,
        aspectRatio: "9:16",
        prompt:
          "围绕窄边框显示器生成一条完整电商视频，保持商品外观稳定。",
        negativePrompt: "禁止字幕、水印、额外品牌和变形 Logo。",
        shots: [
          {
            index: 0,
            startSec: 0,
            endSec: 3,
            providerPrompt:
              "普通家用或办公桌面场景，特写显示器窄边框边缘，突出和宽边框显示器的差异。",
            referenceAssetRefs: ["display_1.png"],
            voiceover: "窄边框，让桌面更清爽。",
          },
          {
            index: 1,
            startSec: 3,
            endSec: 6,
            providerPrompt:
              "简约桌面摆放场景，展示显示器完整放在桌面的状态，凸显外观适配性。",
            referenceAssetRefs: ["display_1.png"],
            voiceover: "工作和娱乐都能自然融入。",
          },
        ],
        tts: {
          enabled: true,
          source: "shots.voiceover",
          voiceover: "窄边框，让桌面更清爽。工作和娱乐都能自然融入。",
        },
        assumptions: ["以 display_1.png 作为唯一商品事实源。"],
      },
    });

    assert.match(prompt, /生成一条完整连续的 Seedance 图生视频/);
    assert.match(prompt, /以传入 Seedance 的首帧商品图作为商品外观事实源/);
    assert.match(prompt, /剧本素材绑定 ref：display_1\.png/);
    assert.match(prompt, /0-3 秒：普通家用或办公桌面场景/);
    assert.match(prompt, /3-6 秒：简约桌面摆放场景/);
    assert.match(prompt, /引用素材：display_1\.png/);
    assert.match(prompt, /禁止字幕、水印、额外品牌和变形 Logo/);
    assert.match(prompt, /窄边框，让桌面更清爽。工作和娱乐都能自然融入。/);
    assert.doesNotMatch(prompt, /smooth stable product move/);
    assert.doesNotMatch(prompt, /目标人群：电商消费者/);
    assert.doesNotMatch(prompt, /3-8 秒：用简单使用场景或细节特写/);
    assert.equal(
      countOccurrences(
        prompt,
        "普通家用或办公桌面场景，特写显示器窄边框边缘，突出和宽边框显示器的差异。",
      ),
      1,
    );
  });

  it("uses default negative constraints and explicit no-TTS wording", () => {
    const prompt = buildSeedanceVideoExportPrompt({
      shotPrompt: {
        targetProvider: "seedance",
        durationSec: 8,
        aspectRatio: "1:1",
        prompt: "围绕商品生成稳定可信的正方形电商视频。",
        negativePrompt: "",
        shots: [
          {
            index: 0,
            startSec: 0,
            endSec: 4,
            providerPrompt: "商品居中展示，背景干净，保持外观一致。",
            referenceAssetRefs: [],
            voiceover: "看清商品细节。",
          },
        ],
        tts: {
          enabled: false,
          source: "shots.voiceover",
          voiceover: "看清商品细节。",
        },
        assumptions: [],
      },
    });

    assert.match(
      prompt,
      /不要出现字幕、水印、额外品牌、失真 Logo、与素材不一致的商品/,
    );
    assert.match(prompt, /无 TTS；按逐镜头口播理解节奏/);
    assert.match(prompt, /引用素材：使用输入商品图片/);
  });
});

describe("buildTwelveSecondVideoPrompt", () => {
  it("builds the conservative V0 whole-video prompt from a creative blueprint", () => {
    const prompt = buildTwelveSecondVideoPrompt({
      narrative: "Open with product trust, show the benefit, close with a hero shot.",
      visualStyle: "clean premium ecommerce",
      targetAudience: "busy office workers",
      coreSellingPoint: "USB-C charging",
      shots: [
        {
          index: 1,
          durationSec: 3,
          purpose: "hook",
          visualPrompt: "Clean hero shot of the blender",
          cameraMotion: "slow push in",
          voiceover: "Meet the portable blender.",
          subtitle: "Blend anywhere"
        },
        {
          index: 2,
          durationSec: 5,
          purpose: "benefit",
          visualPrompt: "Detail shot showing USB-C charging",
          cameraMotion: "smooth pan",
          voiceover: "Charge fast.",
          subtitle: "USB-C charging"
        }
      ],
      renderBrief: {
        productConsistencyRules: ["Keep shape and color consistent"],
        avoid: ["Do not invent brand text"],
        videoPromptSummary: "Clean blender showcase"
      },
      improvementHints: [
        {
          ifVideoLooksBad: "商品不像原图",
          suggestedUserAction: "上传更清晰的商品图。",
          fieldsToChange: ["productImage"]
        }
      ]
    });

    assert.match(prompt, /商品图片是外观事实源/);
    assert.match(prompt, /0-3 秒：干净的商品主视觉镜头/);
    assert.match(prompt, /3-8 秒：用简单使用场景或细节特写/);
    assert.match(prompt, /8-12 秒：回到精致商品主视觉画面/);
    assert.match(prompt, /USB-C charging/);
    assert.match(prompt, /不要生成新的商品部件/);
    assert.doesNotMatch(prompt, /subtitle:/i);
  });

  it("keeps approved shot content as Chinese Seedance-facing storyboard instructions", () => {
    const prompt = buildTwelveSecondVideoPrompt({
      narrative: "总 Prompt：保持商品外观稳定，围绕办公桌快速制作饮品。",
      visualStyle: "9:16 电商 UGC 视频",
      shots: [
        {
          index: 1,
          durationSec: 3,
          purpose: "hook",
          visualPrompt:
            "0-3s hook: 手把 product.png 放在笔记本电脑旁，商品形状保持稳定。",
          cameraMotion: "缓慢推进",
          voiceover: "早会前没时间吃早餐？",
          subtitle: "不进入视频 prompt",
        },
        {
          index: 2,
          durationSec: 3,
          purpose: "benefit",
          visualPrompt:
            "3-6s benefit: 展示 USB-C 充电和快速搅拌，商品外观不改变。",
          cameraMotion: "平稳横移",
          voiceover: "这台小型搅拌杯支持 USB-C 充电。",
          subtitle: "不进入视频 prompt",
        },
      ],
    });

    assert.match(prompt, /视频剧本分镜/);
    assert.match(prompt, /0-3s hook: 手把 product\.png 放在笔记本电脑旁/);
    assert.match(prompt, /3-6s benefit: 展示 USB-C 充电和快速搅拌/);
    assert.doesNotMatch(prompt, /Storyboard inspiration only/i);
    assert.doesNotMatch(prompt, /Create a vertical ecommerce product showcase video/i);
    assert.doesNotMatch(prompt, /subtitle/i);
  });
});
