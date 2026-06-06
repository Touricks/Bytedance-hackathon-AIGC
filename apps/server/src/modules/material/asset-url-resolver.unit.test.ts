import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createAssetUrlResolver } from "./asset-url-resolver.js";

describe("createAssetUrlResolver", () => {
  it("passes through https URLs", async () => {
    const lookup = mock.fn(async (id: string) => ({ id, url: `https://cdn.example/${id}.png`, mime: "image/png" }));
    const readFile = mock.fn(async () => Buffer.from(""));
    const resolver = createAssetUrlResolver({ lookup, readFile });
    const urls = await resolver(["a1"]);
    assert.deepEqual(urls, ["https://cdn.example/a1.png"]);
    assert.equal(readFile.mock.callCount(), 0);
  });

  it("converts local files to data URLs", async () => {
    const lookup = mock.fn(async (id: string) => ({
      id,
      url: `file:///workspace/.daireel/materials/${id}.jpg`,
      localPath: `/workspace/.daireel/materials/${id}.jpg`,
      mime: "image/jpeg",
    }));
    const readFile = mock.fn(async () => Buffer.from("FAKE_JPEG_BYTES"));
    const resolver = createAssetUrlResolver({ lookup, readFile });
    const urls = await resolver(["a2"]);
    assert.equal(urls.length, 1);
    assert.ok(urls[0]!.startsWith("data:image/jpeg;base64,"));
    assert.equal(readFile.mock.callCount(), 1);
  });

  it("drops non-image assets when resolving image references", async () => {
    const lookup = mock.fn(async (id: string) => ({
      id,
      url: `/api/workspaces/ws-1/materials/${id}.mp4`,
      mime: "video/mp4",
    }));
    const readFile = mock.fn(async () => Buffer.from("FAKE_VIDEO_BYTES"));
    const resolver = createAssetUrlResolver({ lookup, readFile });
    const urls = await resolver(["demo-video"]);
    assert.deepEqual(urls, []);
    assert.equal(readFile.mock.callCount(), 0);
  });

  it("drops unknown ids without throwing", async () => {
    const lookup = mock.fn(async () => null);
    const readFile = mock.fn(async () => Buffer.from(""));
    const resolver = createAssetUrlResolver({ lookup, readFile });
    const urls = await resolver(["missing"]);
    assert.deepEqual(urls, []);
  });

  it("returns empty array for empty input", async () => {
    const resolver = createAssetUrlResolver({
      lookup: mock.fn(async () => null),
      readFile: mock.fn(async () => Buffer.from("")),
    });
    assert.deepEqual(await resolver([]), []);
  });
});
