import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { transparentPngBytes } from "../../test/image-fixtures.js";
import {
  maxWorkspaceMaterialBytes,
  workspaceService,
} from "./workspace.service.js";

const providerBrief = {
  product: {
    name: "Provider Mini Blender",
    category: "portable blender",
    keyFacts: ["USB-C charging", "easy cleaning"],
    assets: [{ ref: "product.png", useAs: "primary" }],
  },
  audience: {
    who: "busy office workers",
    painOrDesire: "wants quick smoothies at work",
  },
  coreSellingPoint: "easy cleaning",
  proof: ["Product image shows a compact cup and blade base."],
  offer: null,
  platform: "Seedance",
  brandTone: "clean premium ecommerce",
  bannedExpressions: [],
  landingInfo: null,
  assumptions: ["Capacity is not specified by the source material."],
};

const providerStoryboard = {
  narrative:
    "A busy office worker uses Provider Mini Blender for a quick desk smoothie.",
  totalDurationSec: 12,
  shots: [
    {
      index: 0,
      purpose: "hook",
      durationSec: 3,
      scene: "Office desk hook with a rushed morning",
      visualDirection:
        "Hand places product.png next to a laptop before meetings.",
      productAssetRef: "product.png",
      voiceover: "No time for breakfast before calls?",
      onScreenText: "No time before calls?",
      transition: "cut",
    },
    {
      index: 1,
      purpose: "benefit",
      durationSec: 3,
      scene: "USB-C powered quick blend",
      visualDirection: "Show the compact blender charging and blending fruit.",
      productAssetRef: "product.png",
      voiceover: "This little blender charges by USB-C.",
      onScreenText: "USB-C charging",
      transition: "match cut",
    },
    {
      index: 2,
      purpose: "proof",
      durationSec: 3,
      scene: "Easy rinse after use",
      visualDirection: "Rinse the cup under the office pantry tap.",
      productAssetRef: "product.png",
      voiceover: "And cleanup is just a quick rinse.",
      onScreenText: "Easy rinse cleanup",
      transition: "push",
    },
    {
      index: 3,
      purpose: "cta",
      durationSec: 3,
      scene: "Packshot on office desk",
      visualDirection: "End with a stable packshot and smoothie cup.",
      productAssetRef: "product.png",
      voiceover: "Keep one at your desk.",
      onScreenText: "Desk smoothie, done",
      transition: "fade",
    },
  ],
  assumptions: ["Office usage is inferred from the target audience."],
};

const providerShotPrompt = {
  targetProvider: "seedance",
  durationSec: 12,
  aspectRatio: "9:16",
  prompt:
    "Provider-authored Seedance prompt: keep product.png stable on an office desk while showing a quick smoothie routine.",
  negativePrompt: "extra products, warped logo, unreadable labels",
  shots: [
    {
      index: 0,
      startSec: 0,
      endSec: 3,
      providerPrompt:
        "0-3s hook: hand places product.png beside a laptop, stable product shape.",
      referenceAssetRefs: ["product.png"],
      voiceover: "No time for breakfast before calls?",
      onScreenText: "No time before calls?",
    },
    {
      index: 1,
      startSec: 3,
      endSec: 6,
      providerPrompt:
        "3-6s benefit: show USB-C charging and a quick blend, product remains unchanged.",
      referenceAssetRefs: ["product.png"],
      voiceover: "This little blender charges by USB-C.",
      onScreenText: "USB-C charging",
    },
    {
      index: 2,
      startSec: 6,
      endSec: 9,
      providerPrompt: "6-9s proof: rinse the cup under an office pantry tap.",
      referenceAssetRefs: ["product.png"],
      voiceover: "And cleanup is just a quick rinse.",
      onScreenText: "Easy rinse cleanup",
    },
    {
      index: 3,
      startSec: 9,
      endSec: 12,
      providerPrompt: "9-12s CTA: stable packshot on the desk.",
      referenceAssetRefs: ["product.png"],
      voiceover: "Keep one at your desk.",
      onScreenText: "Desk smoothie, done",
    },
  ],
  tts: {
    enabled: true,
    voiceover:
      "No time for breakfast before calls? This little blender charges by USB-C. And cleanup is just a quick rinse. Keep one at your desk.",
  },
  assumptions: ["Shotprompt keeps product.png as the only visual reference."],
};

async function startArkJsonServer(responses: unknown[]) {
  const bodies: unknown[] = [];
  let responseIndex = 0;
  const server: Server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += String(chunk);
    }
    bodies.push(body ? JSON.parse(body) : {});
    const content = responses[Math.min(responseIndex, responses.length - 1)];
    responseIndex += 1;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(content),
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
    bodies,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function startArkVideoServer() {
  const bodies: unknown[] = [];
  const server: Server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += String(chunk);
    }
    bodies.push(body ? JSON.parse(body) : {});
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ videoUrl: "/mocks/videos/fallback-flower.mp4" }),
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
      }),
  };
}

async function startArkBriefServer() {
  return startArkJsonServer([
    {
      primaryProductRef: "product.png",
      tags: [
        {
          ref: "product.png",
          role: "product_main",
          description: "Main product image showing the portable blender.",
          relevance: "high",
          included: true,
        },
      ],
    },
    providerBrief,
  ]);
}

function setRealArkTextEnv(url: string) {
  const previousModelMode = process.env.MODEL_MODE;
  const previousArkBaseUrl = process.env.ARK_BASE_URL;
  const previousArkKey = process.env.ARK_API_KEY;
  const previousArkTextEndpoint = process.env.ARK_TEXT_ENDPOINT_ID;
  process.env.MODEL_MODE = "real";
  process.env.ARK_BASE_URL = url;
  process.env.ARK_API_KEY = "test-key";
  process.env.ARK_TEXT_ENDPOINT_ID = "doubao-seed-2-0-pro-test";

  return () => {
    if (previousModelMode === undefined) {
      delete process.env.MODEL_MODE;
    } else {
      process.env.MODEL_MODE = previousModelMode;
    }
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

function setRealArkVideoEnv(url: string) {
  const previousArkBaseUrl = process.env.ARK_BASE_URL;
  const previousArkKey = process.env.ARK_API_KEY;
  const previousArkVideoEndpoint = process.env.ARK_VIDEO_ENDPOINT_ID;
  process.env.ARK_BASE_URL = url;
  process.env.ARK_API_KEY = "test-key";
  process.env.ARK_VIDEO_ENDPOINT_ID = "seedance-video-test";

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
    if (previousArkVideoEndpoint === undefined) {
      delete process.env.ARK_VIDEO_ENDPOINT_ID;
    } else {
      process.env.ARK_VIDEO_ENDPOINT_ID = previousArkVideoEndpoint;
    }
  };
}

function setRealMissingArkTextEnv() {
  const previousModelMode = process.env.MODEL_MODE;
  const previousArkKey = process.env.ARK_API_KEY;
  const previousArkTextEndpoint = process.env.ARK_TEXT_ENDPOINT_ID;
  const previousSkipEnvFile = process.env.AIGC_VIDEO_SKIP_ENV_FILE;
  process.env.MODEL_MODE = "real";
  process.env.AIGC_VIDEO_SKIP_ENV_FILE = "true";
  delete process.env.ARK_API_KEY;
  delete process.env.ARK_TEXT_ENDPOINT_ID;

  return () => {
    if (previousModelMode === undefined) {
      delete process.env.MODEL_MODE;
    } else {
      process.env.MODEL_MODE = previousModelMode;
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
    if (previousSkipEnvFile === undefined) {
      delete process.env.AIGC_VIDEO_SKIP_ENV_FILE;
    } else {
      process.env.AIGC_VIDEO_SKIP_ENV_FILE = previousSkipEnvFile;
    }
  };
}

function assertStrictJsonSchemaResponseFormat(
  body: unknown,
  name: string,
): Record<string, unknown> {
  const requestBody = body as {
    response_format?: {
      type?: string;
      json_schema?: {
        name?: string;
        strict?: boolean;
        schema?: Record<string, unknown>;
      };
    };
  };
  assert.equal(requestBody.response_format?.type, "json_schema");
  assert.equal(requestBody.response_format?.json_schema?.name, name);
  assert.equal(requestBody.response_format?.json_schema?.strict, true);
  assert.equal(typeof requestBody.response_format?.json_schema?.schema, "object");
  return requestBody.response_format!.json_schema!.schema!;
}

describe("workspace API", () => {
  let app: FastifyInstance;
  const cleanupDirs: string[] = [];

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
    await Promise.all(
      cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function createWorkspaceDir() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "daireel-workspace-"));
    cleanupDirs.push(dir);
    return dir;
  }

  async function writeWorkspaceMaterial(
    directory: string,
    filename: string,
    data: string | Uint8Array,
  ) {
    const materialDirectory = path.join(directory, ".daireel", "materials");
    await mkdir(materialDirectory, { recursive: true });
    await writeFile(path.join(materialDirectory, filename), data);
  }

  async function openWorkspaceMaterial(directory: string, filename: string) {
    const materialDirectory = path.join(directory, ".daireel", "materials");
    await mkdir(materialDirectory, { recursive: true });
    return open(path.join(materialDirectory, filename), "w");
  }

  async function uploadWorkspaceMaterialMultipart(input: {
    workspaceId: string;
    filename: string;
    content: string | Uint8Array;
    contentType?: string;
  }) {
    const boundary = `----daireel-material-${Math.random().toString(36).slice(2)}`;
    const bytes =
      typeof input.content === "string"
        ? Buffer.from(input.content)
        : Buffer.from(input.content);
    const payload = Buffer.concat([
      Buffer.from(
        [
          `--${boundary}`,
          'Content-Disposition: form-data; name="workspaceId"',
          "",
          input.workspaceId,
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${input.filename}"`,
          `Content-Type: ${input.contentType ?? "text/plain"}`,
          "",
        ].join("\r\n") + "\r\n",
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    return app.inject({
      method: "POST",
      url: "/api/workspaces/materials",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
  }

  async function createWorkspaceWithApprovedBrief() {
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);
    await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });
    await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: { directory, prompt: "Make a compact product demo" },
    });
    const proposedResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/brief/propose",
      payload: {
        directory,
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging, easy cleaning",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
      },
    });
    const proposed = proposedResponse.json();
    await app.inject({
      method: "POST",
      url: "/api/workspaces/artifacts/brief/approve",
      payload: { directory, data: proposed.artifact.data },
    });
    return directory;
  }

  async function createWorkspaceWithApprovedStoryboard() {
    const directory = await createWorkspaceWithApprovedBrief();
    const proposedResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/storyboard/propose",
      payload: { directory },
    });
    const proposed = proposedResponse.json();
    await app.inject({
      method: "POST",
      url: "/api/workspaces/artifacts/storyboard/approve",
      payload: { directory, data: proposed.artifact.data },
    });
    return directory;
  }

  async function createWorkspaceWithApprovedShotPrompt() {
    const directory = await createWorkspaceWithApprovedStoryboard();
    const proposedResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/shotprompt/compile",
      payload: { directory, aspectRatio: "9:16" },
    });
    const proposed = proposedResponse.json();
    await app.inject({
      method: "POST",
      url: "/api/workspaces/artifacts/shotprompt/approve",
      payload: { directory, data: proposed.artifact.data },
    });
    return directory;
  }

  async function waitForCompletedJob(jobId: string) {
    let detail;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const detailResponse = await app.inject({
        method: "GET",
        url: `/api/jobs/${jobId}`,
      });
      detail = detailResponse.json();
      if (detail.job.status === "completed") {
        return detail;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.fail(`Timed out waiting for workspace job ${jobId}`);
  }

  async function waitForTerminalJob(jobId: string) {
    let detail;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const detailResponse = await app.inject({
        method: "GET",
        url: `/api/jobs/${jobId}`,
      });
      detail = detailResponse.json();
      if (["completed", "failed"].includes(detail.job.status)) {
        return detail;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.fail(`Timed out waiting for terminal workspace job ${jobId}`);
  }

  async function startWorkspaceVideo(directory: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/video/generate",
      payload: { directory },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  }

  it("initializes a local workspace manifest and hydrates it from Postgres", async () => {
    const directory = await createWorkspaceDir();

    const initResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });

    assert.equal(initResponse.statusCode, 200, initResponse.body);
    const created = initResponse.json();
    assert.equal(created.workspace.localPath, directory);
    assert.equal(created.workspace.status, "draft");
    assert.equal(typeof created.workspace.id, "string");
    assert.equal(typeof created.workspace.currentScriptId, "string");
    assert.equal(created.workspace.currentJobId, undefined);
    assert.equal(created.manifest.traceFile, ".daireel/trace/events.jsonl");

    const manifest = JSON.parse(
      await readFile(
        path.join(directory, ".daireel", "workspace.json"),
        "utf8",
      ),
    );
    assert.deepEqual(manifest, {
      schemaVersion: 1,
      workspaceId: created.workspace.id,
      currentScriptId: created.workspace.currentScriptId,
      traceFile: ".daireel/trace/events.jsonl",
    });

    const statusResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { directory },
    });

    assert.equal(statusResponse.statusCode, 200, statusResponse.body);
    const hydrated = statusResponse.json();
    assert.equal(hydrated.workspace.id, created.workspace.id);
    assert.equal(
      hydrated.workspace.currentScriptId,
      created.workspace.currentScriptId,
    );
    assert.equal(hydrated.manifest.workspaceId, created.workspace.id);
  });

  it("creates and serves a Fastify-managed workspace without a client path", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: "Desk Demo" },
    });

    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json();
    cleanupDirs.push(created.workspace.localPath);
    assert.match(path.basename(created.workspace.localPath), /^desk-demo-/);
    assert.equal(created.workspace.status, "draft");

    const uploadResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/materials",
      payload: {
        workspaceId: created.workspace.id,
        filename: "notes.txt",
        dataBase64: Buffer.from("office UGC demo notes").toString("base64"),
      },
    });

    assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);
    const uploaded = uploadResponse.json();
    assert.equal(uploaded.material.ref, "notes.txt");
    assert.equal(
      uploaded.material.url,
      `/uploads/workspace-materials/${created.workspace.id}/notes.txt`,
    );

    const servedResponse = await app.inject({
      method: "GET",
      url: uploaded.material.url,
    });
    assert.equal(servedResponse.statusCode, 200, servedResponse.body);
    assert.equal(servedResponse.body, "office UGC demo notes");

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/workspaces",
    });
    assert.equal(listResponse.statusCode, 200, listResponse.body);
    assert.equal(
      listResponse
        .json()
        .workspaces.some(
          (workspace: { id: string }) => workspace.id === created.workspace.id,
        ),
      true,
    );

    const intakeResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: {
        directory: created.workspace.localPath,
        prompt: "Make a quick UGC demo",
      },
    });
    assert.equal(intakeResponse.statusCode, 200, intakeResponse.body);
    assert.deepEqual(
      intakeResponse
        .json()
        .artifact.data.assets.map((asset: { ref: string }) => asset.ref),
      ["notes.txt"],
    );
  });

  it("uploads workspace materials as multipart into the managed materials directory", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: "Multipart Materials" },
    });

    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json();
    cleanupDirs.push(created.workspace.localPath);

    const boundary = "----daireel-material-boundary";
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="workspaceId"',
      "",
      created.workspace.id,
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="notes.txt"',
      "Content-Type: text/plain",
      "",
      "office UGC demo notes",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const uploadResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/materials",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);
    const uploaded = uploadResponse.json();
    assert.equal(uploaded.material.ref, "notes.txt");
    assert.equal(
      await readFile(
        path.join(created.workspace.localPath, ".daireel", "materials", "notes.txt"),
        "utf8",
      ),
      "office UGC demo notes",
    );
    await assert.rejects(
      () => readFile(path.join(created.workspace.localPath, "notes.txt"), "utf8"),
      /ENOENT/,
    );

    const servedResponse = await app.inject({
      method: "GET",
      url: uploaded.material.url,
    });
    assert.equal(servedResponse.statusCode, 200, servedResponse.body);
    assert.equal(servedResponse.body, "office UGC demo notes");

    await writeFile(
      path.join(created.workspace.localPath, "root-only.txt"),
      "must not be scanned",
    );
    const statusResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { workspaceId: created.workspace.id },
    });
    assert.equal(statusResponse.statusCode, 200, statusResponse.body);
    assert.deepEqual(
      statusResponse
        .json()
        .materialLibrary.assets.map((asset: { ref: string }) => asset.ref),
      ["notes.txt"],
    );

    const intakeResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: {
        workspaceId: created.workspace.id,
        prompt: "Make a quick UGC demo",
      },
    });
    assert.equal(intakeResponse.statusCode, 200, intakeResponse.body);
    assert.deepEqual(
      intakeResponse
        .json()
        .artifact.data.assets.map((asset: { ref: string }) => asset.ref),
      ["notes.txt"],
    );
  });

  it("validates multipart workspace material uploads and dedupes same-name files", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: "Upload Validation" },
    });

    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json();
    cleanupDirs.push(created.workspace.localPath);

    const imageResponse = await uploadWorkspaceMaterialMultipart({
      workspaceId: created.workspace.id,
      filename: "product.png",
      content: transparentPngBytes,
      contentType: "image/png",
    });
    assert.equal(imageResponse.statusCode, 200, imageResponse.body);
    assert.equal(imageResponse.json().material.ref, "product.png");

    const duplicateResponse = await uploadWorkspaceMaterialMultipart({
      workspaceId: created.workspace.id,
      filename: "product.png",
      content: transparentPngBytes,
      contentType: "image/png",
    });
    assert.equal(duplicateResponse.statusCode, 200, duplicateResponse.body);
    assert.equal(duplicateResponse.json().material.ref, "product-1.png");

    const videoResponse = await uploadWorkspaceMaterialMultipart({
      workspaceId: created.workspace.id,
      filename: "demo.mp4",
      content: "video bytes",
      contentType: "video/mp4",
    });
    assert.equal(videoResponse.statusCode, 200, videoResponse.body);
    assert.equal(videoResponse.json().material.ref, "demo.mp4");

    await assert.rejects(
      () =>
        workspaceService.uploadMaterial({
          workspaceId: created.workspace.id,
          filename: "large.txt",
          bytes: {
            byteLength: maxWorkspaceMaterialBytes + 1,
          } as Uint8Array,
        }),
      /Material file exceeds 50MB limit/,
    );

    const unsupportedResponse = await uploadWorkspaceMaterialMultipart({
      workspaceId: created.workspace.id,
      filename: "catalog.pdf",
      content: "not supported",
      contentType: "application/pdf",
    });
    assert.equal(unsupportedResponse.statusCode, 400, unsupportedResponse.body);
    assert.match(unsupportedResponse.json().message, /Unsupported material type/);

    const hiddenResponse = await uploadWorkspaceMaterialMultipart({
      workspaceId: created.workspace.id,
      filename: ".secret.txt",
      content: "hidden",
      contentType: "text/plain",
    });
    assert.equal(hiddenResponse.statusCode, 400, hiddenResponse.body);
    assert.match(hiddenResponse.json().message, /must not be hidden/);

    await assert.rejects(
      () =>
        workspaceService.uploadMaterial({
          workspaceId: created.workspace.id,
          filename: "../escape.txt",
          bytes: Buffer.from("escape"),
        }),
      /must not include a path/,
    );
  });

  it("runs workspace operations from workspaceId without a client directory path", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: "Project Workspace" },
    });

    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json();
    cleanupDirs.push(created.workspace.localPath);

    const uploadResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/materials",
      payload: {
        workspaceId: created.workspace.id,
        filename: "notes.txt",
        dataBase64: Buffer.from("office UGC demo notes").toString("base64"),
      },
    });
    assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);

    const statusResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { workspaceId: created.workspace.id },
    });
    assert.equal(statusResponse.statusCode, 200, statusResponse.body);
    assert.equal(statusResponse.json().workspace.id, created.workspace.id);
    assert.deepEqual(
      statusResponse
        .json()
        .materialLibrary.assets.map((asset: { ref: string }) => asset.ref),
      ["notes.txt"],
    );

    const intakeResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: {
        workspaceId: created.workspace.id,
        prompt: "Make a quick UGC demo",
      },
    });
    assert.equal(intakeResponse.statusCode, 200, intakeResponse.body);
    assert.equal(intakeResponse.json().workspace.id, created.workspace.id);
    assert.deepEqual(
      intakeResponse
        .json()
        .artifact.data.assets.map((asset: { ref: string }) => asset.ref),
      ["notes.txt"],
    );
  });

  it("rejects workspaceId resume when the local scriptId does not match Postgres", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: "Forged Manifest" },
    });

    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json();
    cleanupDirs.push(created.workspace.localPath);

    await writeFile(
      path.join(created.workspace.localPath, ".daireel", "workspace.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          workspaceId: created.workspace.id,
          currentScriptId: "forged-script",
          traceFile: ".daireel/trace/events.jsonl",
        },
        null,
        2,
      )}\n`,
    );

    const statusResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { workspaceId: created.workspace.id },
    });

    assert.equal(statusResponse.statusCode, 400, statusResponse.body);
    assert.match(
      statusResponse.json().message,
      /Workspace manifest does not match requested scriptId/,
    );
  });

  it("indexes workspace material into a persisted editable asset manifest", async () => {
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);
    await writeWorkspaceMaterial(directory, "notes.txt", "show the compact size");
    await writeWorkspaceMaterial(directory, "broken.png", "not really an image");

    await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: {
        directory,
        prompt: "Make a compact product demo",
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.workspace.status, "materials_ready");
    assert.equal(body.artifact.type, "assets");
    assert.equal(body.artifact.status, "approved");
    assert.equal(body.artifact.data.primaryProductRef, "product.png");
    assert.deepEqual(
      body.artifact.data.assets.map((asset: { ref: string }) => asset.ref),
      ["notes.txt", "product.png"],
    );
    assert.deepEqual(body.artifact.data.assets[1], {
      ref: "product.png",
      kind: "image",
      mime: "image/png",
      bytes: transparentPngBytes.byteLength,
      sha256: body.artifact.data.assets[1].sha256,
      role: "product_main",
      description: "Accepted image asset product.png",
      relevance: "high",
      usable: true,
      included: true,
    });
    assert.match(body.artifact.data.assets[1].sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(body.artifact.data.rejected, [
      {
        ref: "broken.png",
        reason: "Uploaded product image must be a valid image file: image/png",
      },
    ]);

    const statusResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { directory },
    });
    assert.equal(statusResponse.json().workspace.status, "materials_ready");
  });

  it("returns a sanitized runtime prompt preview after material intake", async () => {
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);
    await writeWorkspaceMaterial(directory, "notes.txt", "show the compact size");

    await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: {
        directory,
        prompt: "Make a compact product demo",
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.promptView.contractId, "material_intake");
    assert.equal(body.promptView.promptVersion, "material-intake.v1");
    assert.equal(body.promptView.provider, "deterministic");
    assert.equal(body.promptView.nl.title, "Material intake prompt");
    assert.deepEqual(
      body.promptView.nl.sections.map((section: { id: string }) => section.id),
      [
        "role",
        "user_intent",
        "selected_material_manifest",
        "task",
        "output_contract",
      ],
    );
    assert.match(
      body.promptView.nl.sections.find(
        (section: { id: string }) =>
          section.id === "selected_material_manifest",
      ).body,
      /product\.png/,
    );
    assert.equal(
      JSON.stringify(body.promptView).includes(
        transparentPngBytes.toString("base64"),
      ),
      false,
    );
  });

  it("rejects unsupported and oversized workspace materials before tagging", async () => {
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);
    await writeWorkspaceMaterial(directory, "catalog.pdf", "not a supported asset");
    const largeText = await openWorkspaceMaterial(directory, "large.txt");
    await largeText.truncate(50 * 1024 * 1024 + 1);
    await largeText.close();

    await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: {
        directory,
        prompt: "Use only valid product assets",
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.deepEqual(
      body.artifact.data.assets.map((asset: { ref: string }) => asset.ref),
      ["product.png"],
    );
    assert.deepEqual(body.artifact.data.rejected, [
      {
        ref: "catalog.pdf",
        reason: "Unsupported material type",
      },
      {
        ref: "large.txt",
        reason: "Material file exceeds 50MB limit",
      },
    ]);
  });

  it("runs material intake only for selected workspace material refs", async () => {
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);
    await writeWorkspaceMaterial(directory, "notes.txt", "show the compact size");
    await writeWorkspaceMaterial(directory, "story.md", "creator should speak casually");

    await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: {
        directory,
        prompt: "Use selected campaign inputs",
        selectedMaterialRefs: ["product.png", "story.md"],
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.artifact.data.primaryProductRef, "product.png");
    assert.deepEqual(
      body.artifact.data.assets.map(
        (asset: { ref: string; included: boolean }) => ({
          ref: asset.ref,
          included: asset.included,
        }),
      ),
      [
        { ref: "product.png", included: true },
        { ref: "story.md", included: true },
      ],
    );
  });

  it("copies selected legacy root material refs into the managed material directory before intake", async () => {
    const directory = await createWorkspaceDir();
    await writeFile(path.join(directory, "display_1.png"), transparentPngBytes);

    await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: {
        directory,
        prompt: "Make a monitor product demo",
        selectedMaterialRefs: ["display_1.png"],
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.deepEqual(
      body.artifact.data.assets.map((asset: { ref: string }) => asset.ref),
      ["display_1.png"],
    );
    assert.deepEqual(
      await readFile(
        path.join(directory, ".daireel", "materials", "display_1.png"),
      ),
      Buffer.from(transparentPngBytes),
    );
  });

  it("rejects selected material refs that are not valid candidates", async () => {
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);
    await writeWorkspaceMaterial(directory, "catalog.pdf", "not a supported asset");

    await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: {
        directory,
        selectedMaterialRefs: ["product.png", "catalog.pdf"],
      },
    });

    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.json().message, /Invalid selected material refs/);
    assert.match(response.json().message, /catalog\.pdf/);
  });

  it("uses the runtime material intake tagging builder in real provider mode", async () => {
    const arkText = await startArkJsonServer([
      {
        primaryProductRef: "product.png",
        tags: [
          {
            ref: "notes.txt",
            role: "spec_text",
            description: "User notes mention compact size and office usage.",
            relevance: "medium",
            included: true,
          },
          {
            ref: "product.png",
            role: "product_main",
            description: "Main product image showing the portable blender.",
            relevance: "high",
            included: true,
          },
        ],
      },
    ]);
    const restoreEnv = setRealArkTextEnv(arkText.url);
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);
    await writeWorkspaceMaterial(directory, "notes.txt", "show the compact size");

    try {
      await app.inject({
        method: "POST",
        url: "/api/workspaces/init",
        payload: { directory },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/workspaces/material-intake",
        payload: {
          directory,
          prompt: "Make an office worker UGC demo",
        },
      });

      assert.equal(response.statusCode, 200, response.body);
      const body = response.json();
      assert.equal(body.artifact.status, "approved");
      assert.equal(body.artifact.data.primaryProductRef, "product.png");
      assert.deepEqual(
        body.artifact.data.assets.map(
          (asset: { ref: string; role: string; description: string }) => ({
            ref: asset.ref,
            role: asset.role,
            description: asset.description,
          }),
        ),
        [
          {
            ref: "notes.txt",
            role: "spec_text",
            description: "User notes mention compact size and office usage.",
          },
          {
            ref: "product.png",
            role: "product_main",
            description: "Main product image showing the portable blender.",
          },
        ],
      );

      const requestBody = arkText.bodies[0] as {
        response_format?: unknown;
        messages: Array<{
          content: Array<{
            type: string;
            text?: string;
            image_url?: { url: string };
          }>;
        }>;
      };
      assertStrictJsonSchemaResponseFormat(requestBody, "material_intake_v1");
      const content = requestBody.messages[0]!.content;
      assert.match(content[0]!.text ?? "", /material intake/i);
      assert.match(
        content.find((part) => part.type === "image_url")?.image_url?.url ?? "",
        /^data:image\/png;base64,/,
      );

      const traceText = await readFile(
        path.join(directory, ".daireel", "trace", "events.jsonl"),
        "utf8",
      );
      assert.match(traceText, /material_intake.request_prepared/);
      assert.match(traceText, /material_intake.parsed/);
      assert.match(traceText, /doubao-seed-2-0-pro-test/);
    } finally {
      restoreEnv();
      await arkText.close();
    }
  });

  it("fails loudly and writes a local trace when real material intake config is missing", async () => {
    const restoreEnv = setRealMissingArkTextEnv();
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);

    try {
      await app.inject({
        method: "POST",
        url: "/api/workspaces/init",
        payload: { directory },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/workspaces/material-intake",
        payload: {
          directory,
          prompt: "Make an office worker UGC demo",
        },
      });

      assert.equal(response.statusCode, 400, response.body);
      assert.match(
        response.json().message,
        /real-provider mode requires Ark text config/,
      );

      const traceText = await readFile(
        path.join(directory, ".daireel", "trace", "events.jsonl"),
        "utf8",
      );
      assert.match(traceText, /material_intake.failed/);
      assert.match(traceText, /material-intake.v1/);
      assert.match(traceText, /"provider":"ark"/);
      assert.match(traceText, /"model":"missing"/);
      assert.match(traceText, /"parsedOutputStatus":"not_attempted"/);
    } finally {
      restoreEnv();
    }
  });

  it("proposes and approves an editable product brief artifact", async () => {
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);
    await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });
    await app.inject({
      method: "POST",
      url: "/api/workspaces/material-intake",
      payload: { directory, prompt: "Make a compact product demo" },
    });

    const proposedResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/brief/propose",
      payload: {
        directory,
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging, easy cleaning",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
      },
    });

    assert.equal(proposedResponse.statusCode, 200, proposedResponse.body);
    const proposed = proposedResponse.json();
    assert.equal(proposed.workspace.status, "brief_proposed");
    assert.equal(proposed.artifact.type, "brief");
    assert.equal(proposed.artifact.status, "proposed");
    assert.equal(proposed.artifact.data.product.name, "Portable Mini Blender");
    assert.deepEqual(proposed.artifact.data.product.assets, [
      { ref: "product.png", useAs: "primary" },
    ]);
    assert.equal(proposed.artifact.data.coreSellingPoint, "USB-C charging");
    assert.equal(proposed.form.artifactType, "brief");
    assert.equal(proposed.promptView.nl.title, "Product brief prompt");
    assert.deepEqual(
      proposed.form.fields.map((field: { path: string }) => field.path),
      [
        "product.name",
        "product.category",
        "product.keyFacts",
        "product.assets",
        "audience.who",
        "audience.painOrDesire",
        "coreSellingPoint",
        "proof",
        "offer",
        "platform",
        "brandTone",
        "bannedExpressions",
        "landingInfo",
        "assumptions",
      ],
    );

    const approvedData = {
      ...proposed.artifact.data,
      coreSellingPoint: "easy cleaning",
    };
    const approvalResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/artifacts/brief/approve",
      payload: { directory, data: approvedData },
    });

    assert.equal(approvalResponse.statusCode, 200, approvalResponse.body);
    const approved = approvalResponse.json();
    assert.equal(approved.workspace.status, "brief_approved");
    assert.equal(approved.artifact.status, "approved");
    assert.equal(approved.artifact.data.coreSellingPoint, "easy cleaning");
  });

  it("uses the runtime product brief builder in real provider mode", async () => {
    const arkText = await startArkBriefServer();
    const restoreEnv = setRealArkTextEnv(arkText.url);
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);

    try {
      await app.inject({
        method: "POST",
        url: "/api/workspaces/init",
        payload: { directory },
      });
      await app.inject({
        method: "POST",
        url: "/api/workspaces/material-intake",
        payload: { directory, prompt: "Make a compact product demo" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/workspaces/brief/propose",
        payload: {
          directory,
          title: "Portable Mini Blender",
          sellingPoints: "USB-C charging, easy cleaning",
          audience: "busy office workers",
          stylePreference: "clean premium ecommerce",
        },
      });

      assert.equal(response.statusCode, 200, response.body);
      const body = response.json();
      assert.equal(body.artifact.status, "proposed");
      assert.equal(body.artifact.data.product.name, "Provider Mini Blender");
      assert.equal(body.artifact.data.coreSellingPoint, "easy cleaning");
      assert.equal(body.trace.provider, "ark");
      assert.equal(body.trace.model, "doubao-seed-2-0-pro-test");
      assert.equal(body.trace.parsedOutputStatus, "valid");

      assertStrictJsonSchemaResponseFormat(
        arkText.bodies[0],
        "material_intake_v1",
      );
      const requestBody = arkText.bodies[1] as {
        response_format?: unknown;
        messages: Array<{
          content: Array<{
            type: string;
            text?: string;
            image_url?: { url: string };
          }>;
        }>;
      };
      assertStrictJsonSchemaResponseFormat(requestBody, "product_brief_v1");
      const content = requestBody.messages[0]!.content;
      assert.match(content[0]!.text ?? "", /product brief/i);
      assert.match(
        content.find((part) => part.type === "image_url")?.image_url?.url ?? "",
        /^data:image\/png;base64,/,
      );

      const traceText = await readFile(
        path.join(directory, ".daireel", "trace", "events.jsonl"),
        "utf8",
      );
      assert.match(traceText, /brief.request_prepared/);
      assert.match(traceText, /provider.response_received/);
      assert.match(traceText, /doubao-seed-2-0-pro-test/);
      assert.match(traceText, /data:image\/<redacted>;base64,<redacted>/);
      assert.equal(
        traceText.includes(transparentPngBytes.toString("base64")),
        false,
      );
    } finally {
      restoreEnv();
      await arkText.close();
    }
  });

  it("fails loudly and traces when a real product brief response cannot be repaired", async () => {
    const arkText = await startArkJsonServer([
      {
        primaryProductRef: "product.png",
        tags: [
          {
            ref: "product.png",
            role: "product_main",
            description: "Main product image showing the portable blender.",
            relevance: "high",
            included: true,
          },
        ],
      },
      "not json",
      "still not json",
    ]);
    const restoreEnv = setRealArkTextEnv(arkText.url);
    const directory = await createWorkspaceDir();
    await writeWorkspaceMaterial(directory, "product.png", transparentPngBytes);

    try {
      await app.inject({
        method: "POST",
        url: "/api/workspaces/init",
        payload: { directory },
      });
      await app.inject({
        method: "POST",
        url: "/api/workspaces/material-intake",
        payload: { directory, prompt: "Make a compact product demo" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/workspaces/brief/propose",
        payload: {
          directory,
          title: "Portable Mini Blender",
          sellingPoints: "USB-C charging, easy cleaning",
          audience: "busy office workers",
          stylePreference: "clean premium ecommerce",
        },
      });

      assert.equal(response.statusCode, 400, response.body);
      assert.match(
        response.json().message,
        /Product brief provider output could not be repaired/,
      );

      const traceText = await readFile(
        path.join(directory, ".daireel", "trace", "events.jsonl"),
        "utf8",
      );
      assert.match(traceText, /brief.parse_failed/);
      assert.match(traceText, /brief.repair_failed/);
      assert.match(traceText, /"parsedOutputStatus":"repair_failed"/);
      assert.equal(
        traceText.includes(transparentPngBytes.toString("base64")),
        false,
      );
    } finally {
      restoreEnv();
      await arkText.close();
    }
  });

  it("proposes and approves an editable UGC storyboard artifact", async () => {
    const directory = await createWorkspaceWithApprovedBrief();

    const proposedResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/storyboard/propose",
      payload: { directory },
    });

    assert.equal(proposedResponse.statusCode, 200, proposedResponse.body);
    const proposed = proposedResponse.json();
    assert.equal(proposed.workspace.status, "storyboard_proposed");
    assert.equal(proposed.artifact.type, "storyboard");
    assert.equal(proposed.artifact.status, "proposed");
    assert.equal(proposed.artifact.data.totalDurationSec, 12);
    assert.equal(proposed.artifact.data.shots.length, 4);
    assert.deepEqual(proposed.artifact.data.shots[0], {
      index: 0,
      purpose: "hook",
      durationSec: 3,
      scene: "Portable Mini Blender hero problem hook",
      visualDirection:
        "Show product.png as the primary product asset with clean premium ecommerce styling.",
      productAssetRef: "product.png",
      voiceover: "Meet Portable Mini Blender.",
      transition: "cut",
    });
    assert.equal(proposed.form.artifactType, "storyboard");
    assert.equal(proposed.promptView.nl.title, "UGC storyboard prompt");
    assert.deepEqual(
      proposed.form.fields.map((field: { path: string }) => field.path),
      [
        "narrative",
        "totalDurationSec",
        "shots[].purpose",
        "shots[].durationSec",
        "shots[].scene",
        "shots[].visualDirection",
        "shots[].productAssetRef",
        "shots[].voiceover",
        "shots[].transition",
        "assumptions",
      ],
    );

    const approvedData = {
      ...proposed.artifact.data,
      shots: proposed.artifact.data.shots.map(
        (shot: { index: number; visualDirection: string }) =>
          shot.index === 0
            ? {
                ...shot,
                visualDirection: "Open with a fast desk setup reveal.",
              }
            : shot,
      ),
    };
    const approvalResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/artifacts/storyboard/approve",
      payload: { directory, data: approvedData },
    });

    assert.equal(approvalResponse.statusCode, 200, approvalResponse.body);
    const approved = approvalResponse.json();
    assert.equal(approved.workspace.status, "storyboard_approved");
    assert.equal(approved.artifact.status, "approved");
    assert.equal(
      approved.artifact.data.shots[0].visualDirection,
      "Open with a fast desk setup reveal.",
    );
  });

  it("uses the runtime UGC storyboard builder in real provider mode", async () => {
    const directory = await createWorkspaceWithApprovedBrief();
    const arkText = await startArkJsonServer([providerStoryboard]);
    const restoreEnv = setRealArkTextEnv(arkText.url);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/workspaces/storyboard/propose",
        payload: { directory },
      });

      assert.equal(response.statusCode, 200, response.body);
      const body = response.json();
      assert.equal(body.workspace.status, "storyboard_proposed");
      assert.equal(body.artifact.status, "proposed");
      assert.equal(
        body.artifact.data.narrative,
        "A busy office worker uses Provider Mini Blender for a quick desk smoothie.",
      );
      assert.equal(
        body.artifact.data.shots[0].voiceover,
        "No time for breakfast before calls?",
      );
      assert.equal(body.artifact.data.shots[0].onScreenText, undefined);
      assert.equal(body.trace.provider, "ark");
      assert.equal(body.trace.model, "doubao-seed-2-0-pro-test");
      assert.equal(body.trace.parsedOutputStatus, "valid");

      const requestBody = arkText.bodies[0] as {
        response_format?: unknown;
        messages: Array<{
          content: string;
        }>;
      };
      const storyboardSchema = assertStrictJsonSchemaResponseFormat(
        requestBody,
        "ugc_storyboard_v1",
      );
      const shotSchema = (
        storyboardSchema.properties as {
          shots: { items: { properties: Record<string, unknown> } };
        }
      ).shots.items.properties;
      assert.deepEqual((shotSchema.purpose as { enum: string[] }).enum, [
        "hook",
        "benefit",
        "proof",
        "cta",
      ]);
      assert.deepEqual(
        (shotSchema.productAssetRef as { enum: string[] }).enum,
        ["product.png"],
      );
      assert.equal("onScreenText" in shotSchema, false);
      assert.match(requestBody.messages[0]!.content, /UGC storyboard/i);
      assert.match(requestBody.messages[0]!.content, /Portable Mini Blender/);
      assert.doesNotMatch(requestBody.messages[0]!.content, /on-screen text/i);
      assert.doesNotMatch(requestBody.messages[0]!.content, /onScreenText/);

      const traceText = await readFile(
        path.join(directory, ".daireel", "trace", "events.jsonl"),
        "utf8",
      );
      assert.match(traceText, /storyboard.request_prepared/);
      assert.match(traceText, /storyboard.parsed/);
      assert.match(traceText, /doubao-seed-2-0-pro-test/);
    } finally {
      restoreEnv();
      await arkText.close();
    }
  });

  it("compiles and approves a deterministic Seedance shotprompt artifact", async () => {
    const directory = await createWorkspaceWithApprovedStoryboard();

    const proposedResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/shotprompt/compile",
      payload: { directory, aspectRatio: "9:16" },
    });

    assert.equal(proposedResponse.statusCode, 200, proposedResponse.body);
    const proposed = proposedResponse.json();
    assert.equal(proposed.workspace.status, "shotprompt_proposed");
    assert.equal(proposed.artifact.type, "shotprompt");
    assert.equal(proposed.artifact.status, "proposed");
    assert.equal(proposed.artifact.data.targetProvider, "seedance");
    assert.equal(proposed.artifact.data.durationSec, 12);
    assert.equal(proposed.artifact.data.aspectRatio, "9:16");
    assert.equal(proposed.artifact.data.shots.length, 4);
    assert.equal(
      proposed.artifact.data.shots[0].providerPrompt,
      "0-3s hook: Portable Mini Blender hero problem hook. Show product.png as the primary product asset with clean premium ecommerce styling. Reference product.png.",
    );
    assert.equal(proposed.artifact.data.shots[0].onScreenText, undefined);
    assert.match(
      proposed.artifact.data.prompt,
      /12 second 9:16 ecommerce UGC video/,
    );
    assert.deepEqual(proposed.artifact.data.tts, {
      enabled: true,
      source: "shots.voiceover",
      voiceover:
        "Meet Portable Mini Blender. USB-C charging. Accepted image asset product.png Try Portable Mini Blender today.",
    });
    assert.equal(proposed.promptView.nl.title, "Video shotprompt prompt");
    assert.deepEqual(
      proposed.form.fields.map((field: { path: string }) => field.path),
      [
        "prompt",
        "negativePrompt",
        "shots[].providerPrompt",
        "shots[].referenceAssetRefs",
        "shots[].voiceover",
        "tts.enabled",
        "tts.voiceover",
        "assumptions",
      ],
    );

    const approvedData = {
      ...proposed.artifact.data,
      negativePrompt: "blur, distorted hands, unreadable text",
    };
    const approvalResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/artifacts/shotprompt/approve",
      payload: { directory, data: approvedData },
    });

    assert.equal(approvalResponse.statusCode, 200, approvalResponse.body);
    const approved = approvalResponse.json();
    assert.equal(approved.workspace.status, "shotprompt_approved");
    assert.equal(approved.artifact.status, "approved");
    assert.equal(
      approved.artifact.data.negativePrompt,
      "blur, distorted hands, unreadable text",
    );
  });

  it("hydrates persisted workspace artifacts in status for historical directories", async () => {
    const directory = await createWorkspaceWithApprovedShotPrompt();

    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { directory },
    });

    assert.equal(response.statusCode, 200, response.body);
    const status = response.json();
    assert.equal(status.workspace.status, "shotprompt_approved");
    assert.equal(status.artifacts.material.type, "assets");
    assert.equal(status.artifacts.material.status, "approved");
    assert.equal(status.artifacts.brief.type, "brief");
    assert.equal(status.artifacts.brief.status, "approved");
    assert.equal(status.artifacts.storyboard.type, "storyboard");
    assert.equal(status.artifacts.storyboard.status, "approved");
    assert.equal(status.artifacts.shotPrompt.type, "shotprompt");
    assert.equal(status.artifacts.shotPrompt.status, "approved");
  });

  it("uses the runtime video shotprompt builder in real provider mode", async () => {
    const directory = await createWorkspaceWithApprovedStoryboard();
    const arkText = await startArkJsonServer([providerShotPrompt]);
    const restoreEnv = setRealArkTextEnv(arkText.url);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/workspaces/shotprompt/compile",
        payload: { directory, aspectRatio: "9:16" },
      });

      assert.equal(response.statusCode, 200, response.body);
      const body = response.json();
      assert.equal(body.workspace.status, "shotprompt_proposed");
      assert.equal(body.artifact.status, "proposed");
      assert.equal(body.artifact.data.prompt, providerShotPrompt.prompt);
      assert.equal(
        body.artifact.data.negativePrompt,
        "extra products, warped logo, unreadable labels",
      );
      assert.equal(body.artifact.data.tts.enabled, true);
      assert.equal(body.trace.provider, "ark");
      assert.equal(body.trace.model, "doubao-seed-2-0-pro-test");
      assert.equal(body.trace.parsedOutputStatus, "valid");

      const requestBody = arkText.bodies[0] as {
        response_format?: unknown;
        messages: Array<{
          content: string;
        }>;
      };
      assertStrictJsonSchemaResponseFormat(requestBody, "video_shotprompt_v1");
      assert.match(requestBody.messages[0]!.content, /video shotprompt/i);
      assert.match(requestBody.messages[0]!.content, /Seedance/i);

      const traceText = await readFile(
        path.join(directory, ".daireel", "trace", "events.jsonl"),
        "utf8",
      );
      assert.match(traceText, /shotprompt.request_prepared/);
      assert.match(traceText, /shotprompt.parsed/);
      assert.match(traceText, /doubao-seed-2-0-pro-test/);
    } finally {
      restoreEnv();
      await arkText.close();
    }
  });

  it("starts final video generation from an approved shotprompt and keeps jobId recoverable", async () => {
    const directory = await createWorkspaceWithApprovedShotPrompt();

    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/video/generate",
      payload: { directory },
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.workspace.status, "video_generating");
    assert.equal(body.workspace.currentJobId, body.job.id);
    assert.equal(body.job.scriptId, body.workspace.currentScriptId);
    assert.equal(body.job.payload.workspaceId, body.workspace.id);
    assert.match(body.job.payload.shotprompt.prompt, /ecommerce UGC video/);

    const manifest = JSON.parse(
      await readFile(
        path.join(directory, ".daireel", "workspace.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.currentJobId, body.job.id);

    const detail = await waitForCompletedJob(body.job.id);
    assert.equal(detail.job.status, "completed");
    assert.equal(detail.finalAsset.type, "final_video");
    assert.equal(detail.videoExport.jobId, body.job.id);
    assert.equal(detail.videoExport.workspaceId, body.workspace.id);
    assert.equal(detail.videoExport.scriptId, body.workspace.currentScriptId);
    assert.equal(
      detail.videoExport.promptView.nl.title,
      "Seedance video prompt",
    );
    assert.match(detail.videoExport.finalVideo.localUrl, /workspace-videos/);

    const statusResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { directory },
    });
    const status = statusResponse.json();
    assert.equal(status.workspace.currentJobId, body.job.id);
    assert.equal(status.workspace.status, "video_ready");
  });

  it("submits a workspace-managed product image to the real Seedance video provider", async () => {
    const directory = await createWorkspaceWithApprovedShotPrompt();
    const arkVideo = await startArkVideoServer();
    const restoreEnv = setRealArkVideoEnv(arkVideo.url);

    try {
      const generation = await startWorkspaceVideo(directory);
      const detail = await waitForTerminalJob(generation.job.id);

      assert.equal(detail.job.status, "completed", detail.job.errorMessage);
      assert.equal(detail.finalAsset.type, "final_video");
      assert.equal(arkVideo.bodies.length, 1);
      const requestBody = arkVideo.bodies[0] as {
        content: Array<{
          type: string;
          image_url?: { url?: string };
        }>;
      };
      const imageInput = requestBody.content.find(
        (item) => item.type === "image_url",
      );
      assert.match(
        imageInput?.image_url?.url ?? "",
        /^data:image\/png;base64,/,
      );
    } finally {
      restoreEnv();
      await arkVideo.close();
    }
  });

  it("traces and submits the approved ShotPrompt prompt as the Seedance main prompt", async () => {
    const directory = await createWorkspaceWithApprovedStoryboard();
    const arkText = await startArkJsonServer([providerShotPrompt]);
    const restoreTextEnv = setRealArkTextEnv(arkText.url);

    try {
      const proposedResponse = await app.inject({
        method: "POST",
        url: "/api/workspaces/shotprompt/compile",
        payload: { directory, aspectRatio: "9:16" },
      });
      const proposed = proposedResponse.json();
      const approvalResponse = await app.inject({
        method: "POST",
        url: "/api/workspaces/artifacts/shotprompt/approve",
        payload: { directory, data: proposed.artifact.data },
      });
      assert.equal(approvalResponse.statusCode, 200, approvalResponse.body);
    } finally {
      restoreTextEnv();
      await arkText.close();
    }

    const arkVideo = await startArkVideoServer();
    const restoreVideoEnv = setRealArkVideoEnv(arkVideo.url);

    try {
      const generation = await startWorkspaceVideo(directory);
      const detail = await waitForTerminalJob(generation.job.id);

      assert.equal(detail.job.status, "completed", detail.job.errorMessage);
      assert.equal(arkVideo.bodies.length, 1);
      const requestBody = arkVideo.bodies[0] as {
        content: Array<{ type: string; text?: string }>;
      };
      const textInput = requestBody.content.find(
        (item) => item.type === "text",
      );
      assert.match(textInput?.text ?? "", /Provider-authored Seedance prompt/);
      assert.match(textInput?.text ?? "", /0-3s hook/);

      const traceText = await readFile(
        path.join(directory, ".daireel", "trace", "events.jsonl"),
        "utf8",
      );
      assert.match(traceText, /video.prompt_prepared/);
      assert.match(traceText, /Provider-authored Seedance prompt/);
    } finally {
      restoreVideoEnv();
      await arkVideo.close();
    }
  });

  it("reports the next action for agent stage continuation", async () => {
    const directory = await createWorkspaceDir();
    await app.inject({
      method: "POST",
      url: "/api/workspaces/init",
      payload: { directory },
    });

    const draftStatusResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { directory },
    });
    const draftAction = draftStatusResponse.json().nextAction;
    assert.equal(draftAction.stage, "materials");
    assert.equal(draftAction.endpoint, "/api/workspaces/material-intake");
    assert.equal(draftAction.method, "POST");
    assert.equal(draftAction.actionType, "runtime_builder");
    assert.equal(draftAction.runtimeBuilder, "material_intake");
    assert.equal(draftAction.runtimeMode, "mock");
    assert.equal(draftAction.requiresHumanApproval, false);
    assert.equal(draftAction.willCallProvider, false);

    const shotPromptDirectory = await createWorkspaceWithApprovedShotPrompt();
    const readyForVideoResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { directory: shotPromptDirectory },
    });
    const videoAction = readyForVideoResponse.json().nextAction;
    assert.equal(videoAction.actionType, "video_generation");
    assert.equal(videoAction.stage, "video");
    assert.equal(videoAction.endpoint, "/api/workspaces/video/generate");
    assert.equal(videoAction.willCallProvider, false);

    const generation = await startWorkspaceVideo(shotPromptDirectory);
    await waitForCompletedJob(generation.job.id);
    const readyForFeedbackResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/status",
      payload: { directory: shotPromptDirectory },
    });
    const feedbackAction = readyForFeedbackResponse.json().nextAction;
    assert.equal(feedbackAction.actionType, "feedback");
    assert.equal(feedbackAction.stage, "feedback");
    assert.equal(feedbackAction.endpoint, "/api/workspaces/feedback/route");
  });

  it("reports real provider continuation metadata for runtime builder stages", async () => {
    const arkText = await startArkJsonServer([
      {
        primaryProductRef: "product.png",
        tags: [
          {
            ref: "product.png",
            role: "product_main",
            description: "Main product image showing the portable blender.",
            relevance: "high",
            included: true,
          },
        ],
      },
    ]);
    const restoreEnv = setRealArkTextEnv(arkText.url);
    const directory = await createWorkspaceDir();

    try {
      await app.inject({
        method: "POST",
        url: "/api/workspaces/init",
        payload: { directory },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/workspaces/status",
        payload: { directory },
      });

      assert.equal(response.statusCode, 200, response.body);
      const action = response.json().nextAction;
      assert.equal(action.actionType, "runtime_builder");
      assert.equal(action.runtimeBuilder, "material_intake");
      assert.equal(action.runtimeMode, "real");
      assert.equal(action.willCallProvider, true);
      assert.equal(action.provider, "ark");
      assert.equal(action.requiresProviderConfig, true);
    } finally {
      restoreEnv();
      await arkText.close();
    }
  });

  it("exposes the V1 pipeline contract registry through a read-only endpoint", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/pipeline/contracts",
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.deepEqual(
      body.steps.map((step: { id: string; activeVersion: string }) => ({
        id: step.id,
        activeVersion: step.activeVersion,
      })),
      [
        { id: "material_intake", activeVersion: "material-intake.v1" },
        { id: "product_brief", activeVersion: "product-brief.v1" },
        { id: "storyboard", activeVersion: "ugc-storyboard.v1" },
        { id: "shotprompt", activeVersion: "video-shotprompt.v1" },
        { id: "video_export", activeVersion: "seedance-video-export.v1" },
      ],
    );
    for (const step of body.steps) {
      assert.equal(typeof step.promptBuilder, "string");
      assert.equal(typeof step.provider, "string");
      assert.equal(typeof step.inputJsonSchema, "object");
      assert.equal(typeof step.outputJsonSchema, "object");
    }
    assert.equal(body.steps.at(-1).promptSource, "compiled_shotprompt");
  });

  it("routes feedback into the current editable artifacts without overwriting older jobs", async () => {
    const directory = await createWorkspaceWithApprovedShotPrompt();
    const firstGeneration = await startWorkspaceVideo(directory);
    const firstJobId = firstGeneration.job.id;
    const firstDetail = await waitForCompletedJob(firstJobId);

    const feedbackResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/feedback/route",
      payload: {
        directory,
        feedback: "Make the opening faster and show the product earlier",
      },
    });

    assert.equal(feedbackResponse.statusCode, 200, feedbackResponse.body);
    const feedback = feedbackResponse.json();
    assert.equal(feedback.workspace.status, "storyboard_proposed");
    assert.equal(feedback.workspace.currentJobId, firstJobId);
    assert.equal(feedback.routeArtifact.type, "feedbackRoute");
    assert.equal(feedback.routeArtifact.data.previousJobId, firstJobId);
    assert.equal(feedback.routeArtifact.data.targetArtifact, "storyboard");
    assert.equal(feedback.artifact.type, "storyboard");
    assert.equal(feedback.artifact.status, "proposed");
    assert.match(
      feedback.artifact.data.shots[0].scene,
      /Earlier product reveal hook/,
    );
    assert.doesNotMatch(
      feedback.artifact.data.shots[0].visualDirection,
      /Make the opening faster/,
    );

    await app.inject({
      method: "POST",
      url: "/api/workspaces/artifacts/storyboard/approve",
      payload: { directory, data: feedback.artifact.data },
    });
    const shotPromptResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/shotprompt/compile",
      payload: { directory, aspectRatio: "9:16" },
    });
    const shotPrompt = shotPromptResponse.json();
    await app.inject({
      method: "POST",
      url: "/api/workspaces/artifacts/shotprompt/approve",
      payload: { directory, data: shotPrompt.artifact.data },
    });

    const secondGeneration = await startWorkspaceVideo(directory);
    assert.notEqual(secondGeneration.job.id, firstJobId);
    assert.equal(
      secondGeneration.workspace.currentJobId,
      secondGeneration.job.id,
    );
    assert.match(
      secondGeneration.job.payload.shotprompt.prompt,
      /latest routed revision/,
    );

    const stillRecoverable = await app.inject({
      method: "GET",
      url: `/api/jobs/${firstJobId}`,
    });
    const oldJob = stillRecoverable.json();
    assert.equal(oldJob.job.status, "completed");
    assert.equal(oldJob.finalAsset.id, firstDetail.finalAsset.id);

    const secondDetail = await waitForCompletedJob(secondGeneration.job.id);
    assert.equal(secondDetail.job.status, "completed");
    assert.match(secondDetail.script.narrative, /latest routed revision/);
    assert.equal(secondDetail.finalAsset.type, "final_video");
    assert.equal(secondDetail.videoExport.jobId, secondGeneration.job.id);
  });
});
