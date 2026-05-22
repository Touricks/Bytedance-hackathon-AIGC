export interface SeedanceVideoRequest {
  imageUrl: string;
  prompt: string;
}

export interface SeedanceVideoResult {
  videoUrl: string;
  provider: "mock" | "seedance";
  prompt: string;
}

export async function generateVideoWithSeedance(
  request: SeedanceVideoRequest
): Promise<SeedanceVideoResult> {
  const videoUrl =
    process.env.MOCK_FINAL_VIDEO_URL ??
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

  // TODO: Replace this fallback with Doubao-Seedance-1.5-pro.
  return {
    videoUrl,
    provider: "mock",
    prompt: request.prompt
  };
}
