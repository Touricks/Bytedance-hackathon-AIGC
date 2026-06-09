import type { ArkResponsesTextProviderRequest } from "../../providers/ark-text.provider.js";

export interface MultimodalImageInput {
  url: string;
  detail?: "low" | "high";
}

export interface MultimodalVideoInput {
  url: string;
  fps?: number;
}

export type MultimodalContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "low" | "high" }
  | { type: "input_video"; video_url: string; fps: number };

export function buildMultimodalContent(input: {
  text: string;
  images?: MultimodalImageInput[];
  videos?: MultimodalVideoInput[];
}): MultimodalContentPart[] {
  return [
    { type: "input_text", text: input.text },
    ...(input.images ?? []).map((image) => ({
      type: "input_image" as const,
      image_url: image.url,
      detail: image.detail ?? "high"
    })),
    ...(input.videos ?? []).map((video) => ({
      type: "input_video" as const,
      video_url: video.url,
      fps: video.fps ?? 0.5
    }))
  ];
}

export function buildArkUserRequest(
  content: string | MultimodalContentPart[],
  temperature = 0.7
): ArkResponsesTextProviderRequest {
  const parts =
    typeof content === "string" ? [{ type: "input_text" as const, text: content }] : content;
  return {
    input: [{ role: "user", content: parts }],
    temperature
  };
}
