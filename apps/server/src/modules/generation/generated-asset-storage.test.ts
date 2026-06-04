import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { downloadHttpGeneratedAsset } from "./generated-asset-storage.js";

describe("downloadHttpGeneratedAsset", () => {
  it("streams a provider asset response to disk and reports bytes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "daireel-asset-"));
    const targetPath = path.join(dir, "video.download");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("mp4-"));
        controller.enqueue(Buffer.from("bytes"));
        controller.close();
      },
    });

    const result = await downloadHttpGeneratedAsset({
      sourceUrl: "https://provider.example/video.mp4",
      targetPath,
      fetchImpl: (async () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "video/mp4" },
        })) as typeof fetch,
      timeoutMs: 1_000,
    });

    assert.equal(result.contentType, "video/mp4");
    assert.equal(result.bytes, 9);
    assert.equal((await readFile(targetPath)).toString("utf8"), "mp4-bytes");
  });

  it("aborts a provider asset stream that exceeds the download timeout", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "daireel-asset-"));
    const targetPath = path.join(dir, "slow.download");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("partial"));
      },
    });

    await assert.rejects(
      downloadHttpGeneratedAsset({
        sourceUrl: "https://provider.example/slow.mp4",
        targetPath,
        fetchImpl: (async () =>
          new Response(stream, {
            status: 200,
            headers: { "content-type": "video/mp4" },
          })) as typeof fetch,
        timeoutMs: 10,
      }),
      /PROVIDER_ASSET_DOWNLOAD_TIMEOUT:10/,
    );
    await assert.rejects(stat(targetPath), /ENOENT/);
  });
});
