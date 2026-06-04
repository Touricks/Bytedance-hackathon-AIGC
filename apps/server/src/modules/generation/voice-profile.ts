import { createHash } from "node:crypto";
import {
  DEFAULT_SHOT_PROMPT_VOICE_PROFILE,
  shotPromptVoiceProfileSchema,
  type ShotPromptVoiceProfile,
} from "@aigc-video/shared";

const genderLabels = {
  female: "女声",
  male: "男声",
} satisfies Record<ShotPromptVoiceProfile["gender"], string>;

const pitchLabels = {
  low: "低沉",
  medium: "自然中声区",
  high: "明亮偏高",
} satisfies Record<ShotPromptVoiceProfile["pitch"], string>;

const paceLabels = {
  slow: "慢速",
  medium: "中速",
  fast: "中等偏快",
} satisfies Record<ShotPromptVoiceProfile["pace"], string>;

export function normalizeSeedanceVoiceProfile(profile?: unknown) {
  return shotPromptVoiceProfileSchema.parse(
    profile ?? DEFAULT_SHOT_PROMPT_VOICE_PROFILE,
  );
}

export function buildSeedanceVoiceProfilePrompt(profile?: unknown) {
  const resolved = normalizeSeedanceVoiceProfile(profile);
  return [
    "声音一致性要求：",
    `本片所有镜头必须使用同一个旁白说话人：${genderLabels[resolved.gender]}，保持同一音色、语速、情绪、普通话口音和电商短视频播报风格。`,
    `旁白语言为自然清晰普通话；语气为${resolved.tone}；声调为${pitchLabels[resolved.pitch]}；语速为${paceLabels[resolved.pace]}，并且必须清楚可懂。`,
    "每个镜头只朗读本镜头口播，不添加额外台词。",
  ].join("");
}

export const seedanceVoiceProfilePrompt = buildSeedanceVoiceProfilePrompt();

export function seedanceVoiceProfileHash(profile?: unknown) {
  return createHash("sha256")
    .update(buildSeedanceVoiceProfilePrompt(profile))
    .digest("hex");
}
