import type { CreativeBlueprint, GeneratedScript } from "@aigc-video/shared";

type VideoPromptInput = GeneratedScript | CreativeBlueprint;

function getCoreSellingPoint(input: VideoPromptInput) {
  if ("coreSellingPoint" in input && input.coreSellingPoint) {
    return input.coreSellingPoint;
  }

  return input.shots[0]?.visualPrompt ?? input.narrative;
}

function getTargetAudience(input: VideoPromptInput) {
  return "targetAudience" in input && input.targetAudience
    ? input.targetAudience
    : "ecommerce shoppers";
}

export function buildTwelveSecondVideoPrompt(input: VideoPromptInput): string {
  const sellingPoint = getCoreSellingPoint(input);
  const audience = getTargetAudience(input);
  const shotInspiration = input.shots
    .map((shot) => `${shot.index}. ${shot.visualPrompt}; camera: ${shot.cameraMotion}`)
    .join("\n");

  return [
    "Create a vertical ecommerce product showcase video within 12 seconds,",
    "based on the provided product image as the source of truth.",
    "",
    "Keep the product's shape, color, material, logo, packaging, and key details consistent.",
    "Do not invent new product parts, extra brands, or readable text.",
    "",
    "0-3s: clean hero shot of the product, centered and well lit, slow push-in.",
    `3-8s: simple use-context or detail close-up showing the key selling point: ${sellingPoint}.`,
    "8-12s: return to a polished product hero shot with a clear call-to-action feeling.",
    "",
    `Visual style: ${input.visualStyle || "clean premium ecommerce, realistic lighting, high trust"}.`,
    `Target audience: ${audience}.`,
    "Camera: smooth, stable, no fast cuts, no crowded background.",
    "",
    "Storyboard inspiration only; do not render these as separate stitched clips:",
    shotInspiration
  ].join("\n");
}
