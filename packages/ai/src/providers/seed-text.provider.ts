import {
  type CreateCreativeBlueprintRequest,
  type GeneratedScript,
  generatedScriptSchema
} from "@aigc-video/shared";

export async function generateScriptWithSeed(
  input: CreateCreativeBlueprintRequest
): Promise<GeneratedScript> {
  // TODO: Replace this deterministic fallback with Doubao-Seed-2.0-pro.
  const fallback: GeneratedScript = {
    narrative: `${input.title} 的 12 秒带货短视频：开场抓注意力，中段突出卖点，结尾推动转化。`,
    visualStyle: "clean ecommerce product demo, bright, premium, vertical short video",
    shots: [
      {
        index: 1,
        durationSec: 3,
        visualPrompt: `Hero opening shot of ${input.title} with clear product focus`,
        cameraMotion: "slow push in",
        voiceover: `${input.title}，第一眼就能抓住注意力。`,
        subtitle: "第一眼就被吸引"
      },
      {
        index: 2,
        durationSec: 5,
        visualPrompt: `Show the product benefits: ${input.sellingPoints}`,
        cameraMotion: "smooth side pan",
        voiceover: `核心卖点是：${input.sellingPoints}`,
        subtitle: input.sellingPoints
      },
      {
        index: 3,
        durationSec: 4,
        visualPrompt: `Lifestyle closing scene for ${input.audience}`,
        cameraMotion: "gentle pull back",
        voiceover: `适合${input.audience}，现在就试试。`,
        subtitle: "现在就试试"
      }
    ]
  };

  return generatedScriptSchema.parse(fallback);
}
