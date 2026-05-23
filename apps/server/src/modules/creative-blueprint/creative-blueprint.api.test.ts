import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";

const validBlueprint = {
  narrative: "A focused 12-second product story for a mini blender.",
  visualStyle: "clean premium ecommerce",
  targetAudience: "busy office workers",
  coreSellingPoint: "USB-C charging",
  shots: [
    {
      index: 1,
      durationSec: 3,
      purpose: "hook",
      visualPrompt: "Clean hero shot of the blender on a bright counter",
      cameraMotion: "slow push in",
      voiceover: "Meet the portable blender.",
      subtitle: "Blend anywhere"
    },
    {
      index: 2,
      durationSec: 5,
      purpose: "benefit",
      visualPrompt: "Close detail showing USB-C charging and easy cleaning",
      cameraMotion: "smooth pan",
      voiceover: "Charge fast and clean in seconds.",
      subtitle: "USB-C, easy cleaning"
    },
    {
      index: 3,
      durationSec: 4,
      purpose: "cta",
      visualPrompt: "Return to a polished hero shot with fresh smoothie",
      cameraMotion: "gentle pull back",
      voiceover: "Make healthy habits simple.",
      subtitle: "Start today"
    }
  ],
  renderBrief: {
    productConsistencyRules: ["Keep product shape and color consistent"],
    avoid: ["Do not invent readable brand text"],
    videoPromptSummary: "Clean 12-second blender product showcase"
  },
  improvementHints: [
    {
      ifVideoLooksBad: "商品不像原图",
      suggestedUserAction: "上传更清晰的正面商品图。",
      fieldsToChange: ["productImage"]
    }
  ]
};

async function startArkTextServer() {
  const bodies: unknown[] = [];
  const server: Server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += String(chunk);
    }
    bodies.push(body ? JSON.parse(body) : {});
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(validBlueprint)
            }
          }
        ]
      })
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert(address && typeof address === "object");

  return {
    url: `http://127.0.0.1:${address.port}`,
    bodies,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

function setArkTextEnv(url: string) {
  const previousArkBaseUrl = process.env.ARK_BASE_URL;
  const previousArkKey = process.env.ARK_API_KEY;
  const previousArkTextEndpoint = process.env.ARK_TEXT_ENDPOINT_ID;
  process.env.ARK_BASE_URL = url;
  process.env.ARK_API_KEY = "test-key";
  process.env.ARK_TEXT_ENDPOINT_ID = "doubao-seed-2-0-pro-test";

  return () => {
    if (previousArkBaseUrl === undefined) {
      delete process.env.ARK_BASE_URL;
    } else {
      process.env.ARK_BASE_URL = previousArkBaseUrl;
    }
    if (previousArkKey === undefined) {
      delete process.env.ARK_API_KEY;
    } else {
      process.env.ARK_API_KEY = previousArkKey;
    }
    if (previousArkTextEndpoint === undefined) {
      delete process.env.ARK_TEXT_ENDPOINT_ID;
    } else {
      process.env.ARK_TEXT_ENDPOINT_ID = previousArkTextEndpoint;
    }
  };
}

describe("creative blueprint API", () => {
  let app: FastifyInstance;
  let traceRoot: string;
  let previousTraceLogDir: string | undefined;

  before(async () => {
    traceRoot = await mkdtemp(path.join(os.tmpdir(), "aigc-server-trace-"));
    previousTraceLogDir = process.env.TRACE_LOG_DIR;
    process.env.TRACE_LOG_DIR = traceRoot;
    app = await buildServer();
  });

  after(async () => {
    await app.close();
    if (previousTraceLogDir === undefined) {
      delete process.env.TRACE_LOG_DIR;
    } else {
      process.env.TRACE_LOG_DIR = previousTraceLogDir;
    }
  });

  it("persists a creative blueprint synchronously and returns a stable scriptId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/creative-blueprints",
      payload: {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging, easy cleaning, powerful smoothie blending",
        audience: "busy office workers and fitness beginners",
        stylePreference: "clean premium ecommerce",
        imageUrl: "/mocks/products/demo-product.svg"
      }
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(typeof body.scriptId, "string");
    assert.equal(body.product.title, "Portable Mini Blender");
    assert.equal(body.imageAsset.type, "product_image");
    assert.equal(body.creativeBlueprint.targetAudience, "busy office workers and fitness beginners");
    assert.ok(body.creativeBlueprint.narrative.includes("Portable Mini Blender"));
    assert.equal(body.shots.length, 3);
    assert.equal(body.shots[0].scriptId, body.scriptId);
    assert.equal(body.job, undefined);

    const traceLines = (
      await readFile(
        path.join(traceRoot, body.scriptId, "events.jsonl"),
        "utf8"
      )
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      traceLines.map((event) => event.kind),
      ["session.started", "blueprint.completed"]
    );
    assert.equal(traceLines[0].scriptId, body.scriptId);
  });

  it("hydrates a persisted creative blueprint by scriptId", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/creative-blueprints",
      payload: {
        title: "Travel Skincare Kit",
        sellingPoints: "leakproof bottles, compact pouch, TSA friendly",
        audience: "frequent travelers",
        stylePreference: "bright clean travel lifestyle",
        imageUrl: "/mocks/products/demo-product.svg"
      }
    });

    const created = createResponse.json();
    const getResponse = await app.inject({
      method: "GET",
      url: `/api/creative-blueprints/${created.scriptId}`
    });

    assert.equal(getResponse.statusCode, 200);

    const body = getResponse.json();
    assert.equal(body.scriptId, created.scriptId);
    assert.equal(body.product.title, "Travel Skincare Kit");
    assert.equal(body.imageAsset.url, "/mocks/products/demo-product.svg");
    assert.equal(body.creativeBlueprint.coreSellingPoint, "leakproof bottles, compact pouch, TSA friendly");
    assert.equal(body.shots.length, 3);
  });

  it("returns scriptId and writes failure trace when blueprint generation fails before persistence", async () => {
    const previousModelMode = process.env.MODEL_MODE;
    process.env.MODEL_MODE = "real";

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/creative-blueprints",
        payload: {
          title: "Portable Mini Blender",
          sellingPoints: "USB-C charging",
          audience: "busy office workers",
          stylePreference: "clean premium ecommerce",
          imageUrl: "/mocks/products/demo-product.svg"
        }
      });

      assert.equal(response.statusCode, 400, response.body);
      const body = response.json();
      assert.equal(typeof body.scriptId, "string");
      assert.match(body.message, /real-provider mode requires Ark text config/);

      const getResponse = await app.inject({
        method: "GET",
        url: `/api/creative-blueprints/${body.scriptId}`
      });
      assert.equal(getResponse.statusCode, 404);

      const traceLines = (
        await readFile(
          path.join(traceRoot, body.scriptId, "events.jsonl"),
          "utf8"
        )
      )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        traceLines.map((event) => event.kind),
        ["session.started", "blueprint.failed"]
      );
      assert.equal(traceLines[1].status, "error");
      assert.match(traceLines[1].meta.error, /real-provider mode requires/);
    } finally {
      if (previousModelMode === undefined) {
        delete process.env.MODEL_MODE;
      } else {
        process.env.MODEL_MODE = previousModelMode;
      }
    }
  });

  it("overwrites an unfrozen draft when regenerating with draftScriptId", async () => {
    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/creative-blueprints",
      payload: {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
        imageUrl: "/mocks/products/demo-product.svg"
      }
    });
    const first = firstResponse.json();

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/creative-blueprints",
      payload: {
        draftScriptId: first.scriptId,
        title: "Portable Mini Blender Pro",
        sellingPoints: "quiet motor and dishwasher-safe cup",
        audience: "fitness beginners",
        stylePreference: "bright studio demo",
        imageUrl: "/mocks/products/demo-product.svg"
      }
    });

    assert.equal(secondResponse.statusCode, 200);

    const second = secondResponse.json();
    assert.equal(second.scriptId, first.scriptId);
    assert.equal(second.script.version, 1);
    assert.equal(second.product.title, "Portable Mini Blender Pro");
    assert.ok(second.creativeBlueprint.narrative.includes("Portable Mini Blender Pro"));
    assert.equal(second.shots[1].subtitle, "quiet motor and dishwasher-safe cup");
  });

  it("sends uploaded raster product images to Doubao as multimodal content", async () => {
    const arkText = await startArkTextServer();
    const restoreEnv = setArkTextEnv(arkText.url);

    try {
      const uploadResponse = await app.inject({
        method: "POST",
        url: "/api/materials/product-image",
        payload: {
          filename: "mini-blender.png",
          contentType: "image/png",
          dataBase64: Buffer.from("png product image").toString("base64")
        }
      });
      assert.equal(uploadResponse.statusCode, 200);
      const imageAsset = uploadResponse.json();

      const blueprintResponse = await app.inject({
        method: "POST",
        url: "/api/creative-blueprints",
        payload: {
          title: "Portable Mini Blender",
          sellingPoints: "USB-C charging",
          audience: "busy office workers",
          stylePreference: "clean premium ecommerce",
          imageUrl: imageAsset.url
        }
      });

      assert.equal(blueprintResponse.statusCode, 200);
      const blueprint = blueprintResponse.json();
      assert.equal(blueprint.provider, "ark");
      assert.equal(blueprint.trace.imageReferenceMode, "data_url");

      const requestBody = arkText.bodies[0] as {
        messages: Array<{
          content: Array<{ type: string; image_url?: { url: string } }>;
        }>;
      };
      const content = requestBody.messages[0]!.content;
      const imagePart = content.find((part) => part.type === "image_url");
      assert.match(imagePart?.image_url?.url ?? "", /^data:image\/png;base64,/);
      assert.doesNotMatch(
        imagePart?.image_url?.url ?? "",
        /\/uploads\/product-images\//
      );

      const traceText = await readFile(
        path.join(traceRoot, blueprint.scriptId, "events.jsonl"),
        "utf8"
      );
      assert.match(traceText, /provider.response_received/);
      assert.match(traceText, /USB-C charging/);
      assert.doesNotMatch(traceText, /cG5nIHByb2R1Y3QgaW1hZ2U=/);
      assert.match(traceText, /data:image\/<redacted>;base64,<redacted>/);
    } finally {
      restoreEnv();
      await arkText.close();
    }
  });
});
