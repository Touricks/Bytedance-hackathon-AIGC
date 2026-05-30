import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertImageDimensionsWithinPolicy,
  readRasterImageDimensions,
  MIN_IMAGE_DIMENSION,
} from "./image-validation.js";
import { HttpError } from "./errors.js";

// The 1x1 transparent PNG used as the universal mock-mode fixture.
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

// A valid 64x64 RGB PNG (>= the 14px floor).
const sixtyFourPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAUklEQVR42u3PMQ0AAAgDMIRNCYqRhQQuviY10JrkVXpelYCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAZQHIEvEtQ7Jm2gAAAABJRU5ErkJggg==",
  "base64",
);

test("readRasterImageDimensions reads PNG dimensions from the IHDR chunk", () => {
  assert.deepEqual(readRasterImageDimensions(onePixelPng, "image/png"), {
    width: 1,
    height: 1,
  });
  assert.deepEqual(readRasterImageDimensions(sixtyFourPng, "image/png"), {
    width: 64,
    height: 64,
  });
});

test("readRasterImageDimensions returns undefined for undecodable input (no false reject)", () => {
  // Too-short buffer and an unsupported/undecodable format must not throw.
  assert.equal(readRasterImageDimensions(Buffer.from("png"), "image/png"), undefined);
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]);
  assert.equal(readRasterImageDimensions(tiff, "image/tiff"), undefined);
});

test("assertImageDimensionsWithinPolicy rejects sub-floor images with a clean 400 IMAGE_TOO_SMALL", () => {
  let thrown: unknown;
  try {
    assertImageDimensionsWithinPolicy(onePixelPng, "image/png");
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof HttpError, "expected an HttpError");
  assert.equal((thrown as HttpError).statusCode, 400);
  assert.equal((thrown as HttpError).code, "IMAGE_TOO_SMALL");
});

test("assertImageDimensionsWithinPolicy accepts images at or above the minimum dimension", () => {
  assert.doesNotThrow(() =>
    assertImageDimensionsWithinPolicy(sixtyFourPng, "image/png"),
  );
});

test("assertImageDimensionsWithinPolicy defers to the provider when dimensions cannot be decoded", () => {
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]);
  assert.doesNotThrow(() => assertImageDimensionsWithinPolicy(tiff, "image/tiff"));
});

test("MIN_IMAGE_DIMENSION matches the Ark vision-model floor", () => {
  assert.equal(MIN_IMAGE_DIMENSION, 14);
});
