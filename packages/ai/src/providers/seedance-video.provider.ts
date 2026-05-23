import { isRealProviderMode } from "./provider-mode.js";

export interface SeedanceVideoRequest {
  imageUrl: string;
  prompt: string;
}

export interface SeedanceVideoResult {
  videoUrl: string;
  provider: "mock" | "seedance";
  prompt: string;
}

interface SeedanceProviderOptions {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
}

function extractVideoUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.videoUrl === "string") {
    return record.videoUrl;
  }
  if (typeof record.video_url === "string") {
    return record.video_url;
  }
  if (record.data && typeof record.data === "object") {
    return extractVideoUrl(record.data);
  }

  return null;
}

export async function generateVideoWithSeedance(
  request: SeedanceVideoRequest,
  options: SeedanceProviderOptions = {}
): Promise<SeedanceVideoResult> {
  const apiUrl = options.apiUrl ?? process.env.SEEDANCE_API_URL;
  const apiKey = options.apiKey ?? process.env.SEEDANCE_API_KEY;
  const model =
    options.model ?? process.env.SEEDANCE_MODEL ?? process.env.ARK_VIDEO_ENDPOINT_ID;

  if (!apiUrl || !apiKey) {
    if (isRealProviderMode()) {
      throw new Error(
        "real-provider mode requires Seedance config: SEEDANCE_API_URL and SEEDANCE_API_KEY"
      );
    }

    const videoUrl =
      process.env.MOCK_FINAL_VIDEO_URL ?? "/mocks/videos/fallback-flower.mp4";

    return {
      videoUrl,
      provider: "mock",
      prompt: request.prompt
    };
  }

  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      image_url: request.imageUrl,
      prompt: request.prompt,
      duration: 12,
      aspect_ratio: "9:16"
    })
  });

  if (!response.ok) {
    throw new Error(`Seedance request failed with status ${response.status}`);
  }

  const videoUrl = extractVideoUrl(await response.json());
  if (!videoUrl) {
    throw new Error("Seedance response did not include a video URL");
  }

  return {
    videoUrl,
    provider: "seedance",
    prompt: request.prompt
  };
}
