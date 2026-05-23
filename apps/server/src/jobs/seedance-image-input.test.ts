import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { Asset } from "@aigc-video/shared";
import { resolveSeedanceImageInput } from "./seedance-image-input.js";

function productImageAsset(input: Partial<Asset>): Asset {
  return {
    id: "asset_123",
    type: "product_image",
    source: "upload",
    url: "/uploads/product-images/demo.png",
    createdAt: new Date(0).toISOString(),
    ...input
  };
}

async function withUploadDir<T>(
  callback: (paths: { uploadDir: string; productDir: string }) => Promise<T>
) {
  const uploadDir = await mkdtemp(path.join(os.tmpdir(), "seedance-image-"));
  const productDir = path.join(uploadDir, "product-images");
  await mkdir(productDir, { recursive: true });

  try {
    return await callback({ uploadDir, productDir });
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
}

describe("resolveSeedanceImageInput", () => {
  it("converts a local PNG upload to a data URL", async () => {
    await withUploadDir(async ({ uploadDir, productDir }) => {
      const storagePath = path.join(productDir, "demo.png");
      await writeFile(storagePath, Buffer.from("png bytes"));

      const result = await resolveSeedanceImageInput(
        productImageAsset({
          metadata: {
            contentType: "image/png",
            sizeBytes: 9,
            storagePath
          }
        }),
        { uploadDir }
      );

      assert.equal(
        result,
        `data:image/png;base64,${Buffer.from("png bytes").toString("base64")}`
      );
    });
  });

  it("converts a local JPEG upload to a lowercase MIME data URL", async () => {
    await withUploadDir(async ({ uploadDir, productDir }) => {
      const storagePath = path.join(productDir, "demo.jpg");
      await writeFile(storagePath, Buffer.from("jpeg bytes"));

      const result = await resolveSeedanceImageInput(
        productImageAsset({
          url: "/uploads/product-images/demo.jpg",
          metadata: {
            contentType: "IMAGE/JPEG",
            sizeBytes: 10,
            storagePath
          }
        }),
        { uploadDir }
      );

      assert.equal(
        result,
        `data:image/jpeg;base64,${Buffer.from("jpeg bytes").toString("base64")}`
      );
    });
  });

  it("passes through public URLs, existing data URLs, and Ark asset IDs", async () => {
    await assert.doesNotReject(async () => {
      assert.equal(
        await resolveSeedanceImageInput(
          productImageAsset({ url: "https://cdn.example/product.png" })
        ),
        "https://cdn.example/product.png"
      );
      assert.equal(
        await resolveSeedanceImageInput(
          productImageAsset({ url: "data:image/png;base64,abc123" })
        ),
        "data:image/png;base64,abc123"
      );
      assert.equal(
        await resolveSeedanceImageInput(
          productImageAsset({ url: "asset://seedance-product-image" })
        ),
        "asset://seedance-product-image"
      );
    });
  });

  it("rejects SVG and non-image MIME types before provider calls", async () => {
    await assert.rejects(
      () =>
        resolveSeedanceImageInput(
          productImageAsset({
            url: "data:image/svg+xml;base64,abc123"
          })
        ),
      /Unsupported Seedance product image content type/
    );

    await assert.rejects(
      () =>
        resolveSeedanceImageInput(
          productImageAsset({
            metadata: {
              contentType: "application/pdf",
              sizeBytes: 10,
              storagePath: "/tmp/demo.pdf"
            }
          })
        ),
      /Unsupported Seedance product image content type/
    );
  });

  it("rejects missing files, path traversal, and oversized local uploads", async () => {
    await withUploadDir(async ({ uploadDir, productDir }) => {
      await assert.rejects(
        () =>
          resolveSeedanceImageInput(
            productImageAsset({
              metadata: {
                contentType: "image/png",
                sizeBytes: 10,
                storagePath: path.join(productDir, "missing.png")
              }
            }),
            { uploadDir }
          ),
        /missing|ENOENT|no such file/i
      );

      await assert.rejects(
        () =>
          resolveSeedanceImageInput(
            productImageAsset({
              url: "/uploads/product-images/../private.png",
              metadata: {
                contentType: "image/png",
                sizeBytes: 10,
                storagePath: path.join(uploadDir, "..", "private.png")
              }
            }),
            { uploadDir }
          ),
        /Invalid upload path/
      );

      const storagePath = path.join(productDir, "large.png");
      await writeFile(storagePath, Buffer.from("large bytes"));
      await assert.rejects(
        () =>
          resolveSeedanceImageInput(
            productImageAsset({
              metadata: {
                contentType: "image/png",
                sizeBytes: 11,
                storagePath
              }
            }),
            { uploadDir, maxSizeBytes: 10 }
          ),
        /too large/
      );
    });
  });
});
