import type { GeneratedScript } from "@aigc-video/shared";

export function buildTwelveSecondVideoPrompt(script: GeneratedScript): string {
  const beats = script.shots
    .map(
      (shot) =>
        `${shot.index}. ${shot.visualPrompt}; camera: ${shot.cameraMotion}; subtitle: ${shot.subtitle}`
    )
    .join("\n");

  return [
    "Generate a polished ecommerce short video within 12 seconds.",
    `Narrative: ${script.narrative}`,
    `Visual style: ${script.visualStyle}`,
    "Use the following story beats as the script structure, not as separate render clips:",
    beats,
    "End with a clear product-focused call to action."
  ].join("\n");
}
