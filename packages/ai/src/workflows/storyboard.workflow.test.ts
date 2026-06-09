import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { describe, it } from "node:test";
import type { TraceEventInput } from "../trace/trace-log.js";
import { generateStoryboardWithArk } from "./storyboard.workflow.js";

const material = {
  scannedAt: "2026-05-26T00:00:00.000Z",
  primaryProductRef: "display_1.png",
  assets: [
    {
      ref: "display_1.png",
      kind: "image" as const,
      mime: "image/png",
      bytes: 100,
      sha256: "a".repeat(64),
      role: "product_main" as const,
      description: "Main product image",
      relevance: "high" as const,
      usable: true,
      included: true,
    },
  ],
  rejected: [],
};

const brief = {
  product: {
    name: "Portable Display",
    category: "desk display",
    keyFacts: ["thin stand"],
    assets: [{ ref: "display_1.png", useAs: "primary" as const }],
  },
  audience: {
    who: "desk workers",
    painOrDesire: "wants a cleaner setup",
  },
  coreSellingPoint: "space-saving desk setup",
  proof: ["Main image shows a compact display stand."],
  offer: null,
  platform: "Seedance",
  brandTone: "clean UGC",
  bannedExpressions: [],
  landingInfo: null,
  assumptions: [],
};

const repairableStoryboard = {
  narrative: "A creator upgrades a cluttered desk with a compact display.",
  totalDurationSec: 15,
  shots: [
    {
      index: 0,
      purpose: "hook",
      durationSec: 4,
      scene: "Cluttered desk problem hook",
      visualDirection: "Show the desk before the upgrade.",
      productAssetRef: "",
      voiceover: "桌面太挤了吗",
      onScreenText: "Cramped desk?",
      transition: "cut",
    },
    {
      index: 1,
      purpose: "core selling point display",
      durationSec: 7,
      scene: "Reveal the display stand",
      visualDirection: "Show the product holding the display.",
      productAssetRef: "",
      voiceover: "支架让空间变清爽",
      onScreenText: "Space-saving setup",
      transition: "match cut",
    },
    {
      index: 2,
      purpose: "conversion guide",
      durationSec: 4,
      scene: "Final organized desk",
      visualDirection: "Show a clean desk with the display centered.",
      productAssetRef: "",
      voiceover: "今天升级桌面",
      onScreenText: "Upgrade your desk",
      transition: "fade",
    },
  ],
  assumptions: ["Desk setup use case is inferred from the brief."],
};

async function startArkJsonServer(responseContent: unknown) {
  const server: Server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Drain request body.
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        status: "completed",
        output_text: JSON.stringify(responseContent),
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

describe("generateStoryboardWithArk", () => {
  it("repairs common Ark storyboard enum and empty asset-ref drift", async () => {
    const events: TraceEventInput[] = [];
    const arkText = await startArkJsonServer(repairableStoryboard);

    try {
      const result = await generateStoryboardWithArk(
        { brief, material },
        {
          env: {
            MODEL_MODE: "real",
            ARK_API_KEY: "test-key",
            ARK_TEXT_ENDPOINT_ID: "ark-storyboard",
            ARK_BASE_URL: arkText.url,
          },
          traceLogger: {
            append: async (event) => {
              events.push(event);
            },
          },
        },
      );

      assert.deepEqual(
        result.storyboard.shots.map((shot) => shot.purpose),
        ["hook", "proof", "cta"],
      );
      assert.deepEqual(
        result.storyboard.shots.map((shot) => shot.productAssetRef),
        ["display_1.png", "display_1.png", "display_1.png"],
      );
      assert.equal(result.trace.parsedOutputStatus, "repaired");

      const repaired = events.find((event) => event.kind === "storyboard.repaired");
      assert.ok(repaired);
      assert.equal(repaired.meta?.parsedOutputStatus, "repaired");
      assert.deepEqual(
        (repaired.meta?.changes as Array<{ path: string }>).map(
          (change) => change.path,
        ),
        [
          "shots[0].productAssetRef",
          "shots[1].purpose",
          "shots[1].productAssetRef",
          "shots[2].purpose",
          "shots[2].productAssetRef",
        ],
      );
    } finally {
      await arkText.close();
    }
  });

  it("returns a readable business error when storyboard repair cannot validate", async () => {
    const events: TraceEventInput[] = [];
    const arkText = await startArkJsonServer({
      ...repairableStoryboard,
      shots: [
        {
          ...repairableStoryboard.shots[0],
          purpose: "unmapped dream sequence",
          productAssetRef: "",
        },
      ],
    });

    try {
      await assert.rejects(
        () =>
          generateStoryboardWithArk(
            { brief, material },
            {
              env: {
                MODEL_MODE: "real",
                ARK_API_KEY: "test-key",
                ARK_TEXT_ENDPOINT_ID: "ark-storyboard",
                ARK_BASE_URL: arkText.url,
              },
              traceLogger: {
                append: async (event) => {
                  events.push(event);
                },
              },
            },
          ),
        /Storyboard provider output could not be repaired/,
      );

      assert.equal(
        events.some((event) => event.kind === "storyboard.repair_failed"),
        true,
      );
    } finally {
      await arkText.close();
    }
  });
});
