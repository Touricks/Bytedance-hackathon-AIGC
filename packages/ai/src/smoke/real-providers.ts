import {
  generateCreativeBlueprintWithArk,
  generateVideoWithSeedance
} from "../index.js";
import { loadWorkspaceEnv } from "../env.js";

loadWorkspaceEnv();

const fullVideoGeneration = process.env.SMOKE_FULL_VIDEO_GENERATION === "true";

function getSmokeValue(name: string, fallback: string) {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

const imageUrl = getSmokeValue(
  "SMOKE_PRODUCT_IMAGE_URL",
  "http://localhost:3000/mocks/products/demo-product.svg"
);

const blueprintResult = await generateCreativeBlueprintWithArk({
  title: getSmokeValue("SMOKE_PRODUCT_TITLE", "Portable Mini Blender"),
  sellingPoints: getSmokeValue(
    "SMOKE_SELLING_POINTS",
    "USB-C charging, easy cleaning, powerful smoothie blending"
  ),
  audience: getSmokeValue("SMOKE_AUDIENCE", "busy office workers"),
  stylePreference: getSmokeValue(
    "SMOKE_STYLE_PREFERENCE",
    "clean premium ecommerce"
  ),
  imageUrl
});

if (blueprintResult.provider !== "ark") {
  throw new Error(
    `Expected creative blueprint provider ark, got ${blueprintResult.provider}`
  );
}

let seedanceProbe:
  | { mode: "full"; status: "completed"; videoUrl: string }
  | { mode: "reachability"; status: "reachable-with-400"; note: string }
  | { mode: "reachability"; status: "completed"; videoUrl: string };

try {
  const videoResult = await generateVideoWithSeedance({
    imageUrl,
    prompt: "Create a vertical 12-second ecommerce product showcase video."
  });

  if (videoResult.provider !== "seedance") {
    throw new Error(
      `Expected video provider seedance, got ${videoResult.provider}`
    );
  }

  seedanceProbe = {
    mode: fullVideoGeneration ? "full" : "reachability",
    status: "completed",
    videoUrl: videoResult.videoUrl
  };
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!fullVideoGeneration && /status 400/.test(message)) {
    seedanceProbe = {
      mode: "reachability",
      status: "reachable-with-400",
      note:
        "Seedance endpoint was reached, but full generation was not validated. Use SMOKE_FULL_VIDEO_GENERATION=true with a public SMOKE_PRODUCT_IMAGE_URL after S3 is available."
    };
  } else {
    throw error;
  }
}

console.log(
  JSON.stringify(
    {
      creativeBlueprintProvider: blueprintResult.provider,
      creativeBlueprintTextProvider: blueprintResult.trace.textProvider,
      seedanceProbe
    },
    null,
    2
  )
);
