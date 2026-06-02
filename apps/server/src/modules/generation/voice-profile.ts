import { createHash } from "node:crypto";

export const seedanceVoiceProfilePrompt = [
  "声音一致性要求：",
  "本片所有镜头必须使用同一个旁白说话人，保持同一音色、语速、情绪、普通话口音和电商短视频播报风格。",
  "旁白语言为自然清晰普通话；语速中等偏快但必须清楚可懂；情绪自信、友好、可信。",
  "每个镜头只朗读本镜头口播，不添加额外台词。",
].join("");

export function seedanceVoiceProfileHash() {
  return createHash("sha256").update(seedanceVoiceProfilePrompt).digest("hex");
}
