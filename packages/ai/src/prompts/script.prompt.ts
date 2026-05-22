import type { CreateGenerationJobRequest } from "@aigc-video/shared";

export function buildScriptPrompt(input: CreateGenerationJobRequest): string {
  return [
    "Create a structured ecommerce short-video script.",
    "The video must fit within 12 seconds and use 2-4 narrative beats.",
    `Product title: ${input.title}`,
    `Selling points: ${input.sellingPoints}`,
    `Target audience: ${input.audience}`,
    "Return strict JSON with narrative, visualStyle and shots."
  ].join("\n");
}
