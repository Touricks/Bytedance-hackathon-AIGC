import assert from "node:assert/strict";
import { test } from "node:test";
import { materialAssetFilename } from "./materials.js";

test("materialAssetFilename displays the file name from an asset ref", () => {
  assert.equal(materialAssetFilename("DSC03395.JPG"), "DSC03395.JPG");
  assert.equal(
    materialAssetFilename("uploads/session/DSC03407.JPG"),
    "DSC03407.JPG",
  );
  assert.equal(
    materialAssetFilename("materials/%E6%B5%B7%E6%B5%AA.jpg"),
    "海浪.jpg",
  );
});

