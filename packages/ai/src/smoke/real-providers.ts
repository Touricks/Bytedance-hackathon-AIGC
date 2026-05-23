import {
  generateCreativeBlueprintWithArk,
  generateVideoWithSeedance
} from "../index.js";
import { loadWorkspaceEnv } from "../env.js";

loadWorkspaceEnv();

const imageUrl = process.env.SMOKE_PRODUCT_IMAGE_URL;

if (!imageUrl) {
  throw new Error(
    "SMOKE_PRODUCT_IMAGE_URL is required for real-provider smoke checks"
  );
}

const blueprintResult = await generateCreativeBlueprintWithArk({
  title: process.env.SMOKE_PRODUCT_TITLE ?? "Portable Mini Blender",
  sellingPoints:
    process.env.SMOKE_SELLING_POINTS ??
    "USB-C charging, easy cleaning, powerful smoothie blending",
  audience: process.env.SMOKE_AUDIENCE ?? "busy office workers",
  stylePreference:
    process.env.SMOKE_STYLE_PREFERENCE ?? "clean premium ecommerce",
  imageUrl
});

if (blueprintResult.provider !== "ark") {
  throw new Error(
    `Expected creative blueprint provider ark, got ${blueprintResult.provider}`
  );
}

const videoResult = await generateVideoWithSeedance({
  imageUrl,
  prompt: "Create a vertical 12-second ecommerce product showcase video."
});

if (videoResult.provider !== "seedance") {
  throw new Error(`Expected video provider seedance, got ${videoResult.provider}`);
}

console.log(
  JSON.stringify(
    {
      creativeBlueprintProvider: blueprintResult.provider,
      videoProvider: videoResult.provider,
      videoUrl: videoResult.videoUrl
    },
    null,
    2
  )
);
