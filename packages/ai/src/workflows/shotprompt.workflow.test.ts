import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { describe, it } from "node:test";
import { buildShotPromptResponseFormat } from "../contracts/response-formats.js";
import type { TraceEventInput } from "../trace/trace-log.js";
import { generateShotPromptWithArk } from "./shotprompt.workflow.js";

const material = {
  scannedAt: "2026-06-02T00:00:00.000Z",
  primaryProductRef: "DSC04549.JPG",
  assets: [
    {
      ref: "DSC04549.JPG",
      kind: "image" as const,
      mime: "image/jpeg",
      bytes: 100,
      sha256: "a".repeat(64),
      role: "product_main" as const,
      description: "优胜美地主图",
      relevance: "high" as const,
      usable: true,
      included: true,
    },
  ],
  rejected: [],
};

const brief = {
  product: {
    name: "优胜美地装饰画",
    category: "家居软装",
    keyFacts: ["高清实拍"],
    assets: [{ ref: "DSC04549.JPG", useAs: "primary" as const }],
  },
  audience: {
    who: "自然风光软装用户",
    painOrDesire: "希望提升家居自然氛围",
  },
  coreSellingPoint: "高清实拍还原自然风光",
  proof: ["主图展示峡谷全景。"],
  offer: null,
  platform: "抖音",
  brandTone: "真实自然",
  bannedExpressions: [],
  landingInfo: null,
  assumptions: [],
};

const storyboard = {
  narrative: "用三个镜头展示装饰画卖点并引导下单。",
  totalDurationSec: 15,
  shots: [
    {
      index: 0,
      purpose: "hook" as const,
      durationSec: 4,
      scene: "空白墙面前后对比",
      visualDirection: "快速切入装饰画整体展示",
      productAssetRef: "DSC04549.JPG",
      voiceover: "墙面空着太单调",
      transition: "硬切",
    },
    {
      index: 1,
      purpose: "proof" as const,
      durationSec: 7,
      scene: "装饰画细节特写",
      visualDirection: "放大展示景观纹理细节",
      productAssetRef: "DSC04549.JPG",
      voiceover: "高清实拍还原峡谷细节",
      transition: "放大转场",
    },
    {
      index: 2,
      purpose: "cta" as const,
      durationSec: 4,
      scene: "完整家居展示并引导下单",
      visualDirection: "拉远展示装饰画完整效果",
      productAssetRef: "DSC04549.JPG",
      voiceover: "点击商品卡入手",
      transition: "切回全景",
    },
  ],
  assumptions: [],
};

const creativeRequirements = {
  image: {
    style: "高端商业产品摄影",
    composition: "主体稳定居中",
    avoid: ["文字贴片", "商品变形"],
  },
  script: { tone: "克制、专业" },
  storyboard: { rhythm: "慢速展示细节" },
  shotImage: { global: "统一高端光线" },
  shotVideo: { global: "慢速稳定运镜" },
};

const oneShotProviderOutput = {
  targetProvider: "seedance",
  durationSec: 15,
  aspectRatio: "9:16",
  prompt: "三镜头装饰画短视频。",
  negativePrompt: "不要画面失真。",
  shots: [
    {
      index: 0,
      startSec: 0,
      endSec: 4,
      providerPrompt: "只返回了第一镜。",
      referenceAssetRefs: ["DSC04549.JPG"],
      voiceover: "墙面空着太单调",
    },
  ],
  tts: {
    enabled: true,
    source: "shots.voiceover",
    voiceover: "墙面空着太单调",
    voiceProfile: {
      gender: "female",
      tone: "自信、友好、可信",
      pitch: "medium",
      pace: "medium",
    },
  },
  assumptions: [],
};

async function startArkJsonServer(responseContent: unknown) {
  const server: Server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Drain request body.
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(responseContent),
            },
          },
        ],
      }),
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert(address && typeof address === "object");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe("shotprompt workflow", () => {
  it("rejects provider outputs that collapse storyboard shots", async () => {
    const events: TraceEventInput[] = [];
    const arkText = await startArkJsonServer(oneShotProviderOutput);

    try {
      await assert.rejects(
        () =>
          generateShotPromptWithArk(
            {
              brief,
              material,
              storyboard,
              aspectRatio: "9:16",
              creativeRequirements,
            },
            {
              env: {
                MODEL_MODE: "real",
                ARK_API_KEY: "test-key",
                ARK_TEXT_ENDPOINT_ID: "ark-shotprompt",
                ARK_BASE_URL: arkText.url,
              },
              traceLogger: {
                append: async (event) => {
                  events.push(event);
                },
              },
            },
          ),
        /Shotprompt provider output does not match storyboard shot count: expected 3, got 1/,
      );

      const parseFailed = events.find(
        (event) => event.kind === "shotprompt.parse_failed",
      );
      assert.ok(parseFailed);
      assert.equal(parseFailed.meta?.parsedOutputStatus, "invalid");
      const prepared = events.find(
        (event) => event.kind === "shotprompt.request_prepared",
      );
      assert.ok(prepared);
      assert.match(
        String(prepared.meta?.prompt),
        /已批准创作要求（导演约束）：/,
      );
      assert.match(String(prepared.meta?.prompt), /- 分镜视频全局要求：慢速稳定运镜/);
    } finally {
      await arkText.close();
    }
  });

  it("constrains the provider schema to the storyboard shot count", () => {
    const responseFormat = buildShotPromptResponseFormat({
      schemaVersion: "video-shotprompt",
      material,
      expectedShotCount: storyboard.shots.length,
    });
    const schema = responseFormat.schema as {
      properties: {
        shots: {
          minItems: number;
          maxItems: number;
          items: {
            required: string[];
            properties: Record<string, unknown>;
          };
        };
      };
    };

    assert.equal(schema.properties.shots.minItems, 3);
    assert.equal(schema.properties.shots.maxItems, 3);
    assert.deepEqual(
      schema.properties.shots.items.required.slice(-2),
      ["shotImage", "shotVideo"],
    );
    assert.ok(schema.properties.shots.items.properties.shotImage);
    assert.ok(schema.properties.shots.items.properties.shotVideo);
  });
});
