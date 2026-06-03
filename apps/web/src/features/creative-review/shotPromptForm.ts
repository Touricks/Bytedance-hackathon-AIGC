import {
  DEFAULT_SHOT_PROMPT_VOICE_PROFILE,
  type ShotPromptVoiceProfile
} from "@aigc-video/shared";
import type { ShotPromptArtifact } from "@aigc-video/shared";
import { linesFromText } from "./storyboardForm.js";

export type ShotPromptShotFormState = {
  providerPrompt: string;
  shotImage: Record<string, string>;
  shotVideo: Record<string, string>;
};

export type ShotPromptFormState = {
  aspectRatio: ShotPromptArtifact["aspectRatio"];
  prompt: string;
  negativePrompt: string;
  voiceProfile: ShotPromptVoiceProfile;
  shots: ShotPromptShotFormState[];
};

export type ShotPromptLayer = "shotImage" | "shotVideo";

const VOICE_GENDER_LABELS: Record<ShotPromptVoiceProfile["gender"], string> = {
  female: "女声",
  male: "男声"
};

const VOICE_PITCH_LABELS: Record<ShotPromptVoiceProfile["pitch"], string> = {
  low: "低沉",
  medium: "自然中声区",
  high: "明亮偏高"
};

const VOICE_PACE_LABELS: Record<ShotPromptVoiceProfile["pace"], string> = {
  slow: "慢速",
  medium: "中速",
  fast: "中等偏快"
};

export const SHOT_IMAGE_LABELS: Record<string, string> = {
  scene: "场景",
  composition: "构图",
  lighting: "光线",
  productVisibility: "商品呈现",
  referenceUsage: "参考图使用",
  style: "视觉风格",
  negative: "负向约束"
};

export const SHOT_VIDEO_LABELS: Record<string, string> = {
  cameraMotion: "镜头运动",
  subjectMotion: "主体运动",
  firstFrameIntent: "首帧意图",
  lastFrameIntent: "末帧意图",
  durationIntent: "时长节奏",
  continuity: "连续性",
  negative: "负向约束"
};

export const SHOT_IMAGE_ORDER = [
  "scene",
  "composition",
  "lighting",
  "productVisibility",
  "referenceUsage",
  "negative"
];

export const SHOT_VIDEO_ORDER = [
  "cameraMotion",
  "subjectMotion",
  "firstFrameIntent",
  "lastFrameIntent",
  "durationIntent",
  "continuity",
  "negative"
];

export const SHOT_IMAGE_REQUIRED_KEYS = SHOT_IMAGE_ORDER.filter(
  (key) => key !== "negative"
);

export const SHOT_VIDEO_REQUIRED_KEYS = SHOT_VIDEO_ORDER.filter(
  (key) => key !== "negative"
);

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function layerKeys(value: unknown, preferredOrder: string[]): string[] {
  if (!isPlainRecord(value)) return [];
  const known = preferredOrder.filter((key) => key in value);
  const extra = Object.keys(value)
    .filter((key) => !preferredOrder.includes(key))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...extra];
}

export function valueToFormText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join("\n");
  }
  if (isPlainRecord(value)) {
    return JSON.stringify(value, null, 2);
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function layerToForm(value: unknown, preferredOrder: string[]) {
  if (!isPlainRecord(value)) {
    return Object.fromEntries(preferredOrder.map((key) => [key, ""]));
  }
  const keys = layerKeys(value, preferredOrder);
  return Object.fromEntries(
    [...preferredOrder, ...keys.filter((key) => !preferredOrder.includes(key))].map(
      (key) => [key, valueToFormText(value[key])]
    )
  );
}

export function formTextToLayerValue(text: string, original: unknown): unknown {
  if (Array.isArray(original)) {
    return linesFromText(text);
  }
  if (typeof original === "number") {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : original;
  }
  if (typeof original === "boolean") {
    return text.trim().toLowerCase() === "true";
  }
  if (isPlainRecord(original)) {
    try {
      const parsed = JSON.parse(text);
      return isPlainRecord(parsed) || Array.isArray(parsed) ? parsed : original;
    } catch {
      return original;
    }
  }
  return text.trim();
}

export function formLayerToRecord(
  formLayer: Record<string, string>,
  currentLayer: unknown
): Record<string, unknown> | undefined {
  const original = isPlainRecord(currentLayer) ? currentLayer : {};
  const entries = Object.entries(formLayer).map(([key, value]) => [
    key,
    formTextToLayerValue(value, original[key])
  ]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function derivedTtsVoiceover(shots: ShotPromptArtifact["shots"]) {
  return shots
    .map((shot) => shot.voiceover.trim())
    .filter(Boolean)
    .join("\n");
}

export function normalizeVoiceProfile(
  profile: Partial<ShotPromptVoiceProfile> | undefined
): ShotPromptVoiceProfile {
  return {
    ...DEFAULT_SHOT_PROMPT_VOICE_PROFILE,
    ...profile,
    tone: profile?.tone?.trim() || DEFAULT_SHOT_PROMPT_VOICE_PROFILE.tone
  };
}

export function describeVoiceProfile(profile: ShotPromptVoiceProfile) {
  return [
    VOICE_GENDER_LABELS[profile.gender],
    profile.tone,
    VOICE_PITCH_LABELS[profile.pitch],
    VOICE_PACE_LABELS[profile.pace]
  ].join(" · ");
}

export function withDerivedTts(shotPrompt: ShotPromptArtifact): ShotPromptArtifact {
  return {
    ...shotPrompt,
    tts: {
      ...shotPrompt.tts,
      source: "shots.voiceover",
      voiceover: derivedTtsVoiceover(shotPrompt.shots),
      voiceProfile: normalizeVoiceProfile(shotPrompt.tts.voiceProfile)
    }
  };
}

export function layerSectionKey(index: number, layer: ShotPromptLayer) {
  return `${index}:${layer}`;
}

export function goalSectionKey(index: number) {
  return `${index}:providerPrompt`;
}

export function layerRequiredKeys(layer: ShotPromptLayer) {
  return layer === "shotImage" ? SHOT_IMAGE_REQUIRED_KEYS : SHOT_VIDEO_REQUIRED_KEYS;
}

export function validateLayerFields(
  fields: Record<string, string>,
  layer: ShotPromptLayer
) {
  return Object.fromEntries(
    layerRequiredKeys(layer)
      .filter((key) => !fields[key]?.trim())
      .map((key) => [key, "必填"])
  );
}

export function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join("、");
  if (isPlainRecord(value)) return JSON.stringify(value);
  if (value === null || value === undefined || value === "") return "未填写";
  return String(value);
}

export function shotDuration(shot: ShotPromptArtifact["shots"][number]) {
  return Math.max(0, shot.endSec - shot.startSec);
}

export function shotLayerEntries(
  shot: ShotPromptArtifact["shots"][number],
  layer: "shotImage" | "shotVideo"
) {
  const labels = layer === "shotImage" ? SHOT_IMAGE_LABELS : SHOT_VIDEO_LABELS;
  const order = layer === "shotImage" ? SHOT_IMAGE_ORDER : SHOT_VIDEO_ORDER;
  const value = layer === "shotImage" ? shot.shotImage : shot.shotVideo;
  if (!isPlainRecord(value)) return [];
  return layerKeys(value, order).map((key) => ({
    key,
    label: labels[key] ?? key,
    value: value[key]
  }));
}

export function shotPromptToForm(shotPrompt: ShotPromptArtifact): ShotPromptFormState {
  return {
    aspectRatio: shotPrompt.aspectRatio,
    prompt: shotPrompt.prompt,
    negativePrompt: shotPrompt.negativePrompt,
    voiceProfile: normalizeVoiceProfile(shotPrompt.tts.voiceProfile),
    shots: shotPrompt.shots.map((shot) => ({
      providerPrompt: shot.providerPrompt,
      shotImage: layerToForm(shot.shotImage, SHOT_IMAGE_ORDER),
      shotVideo: layerToForm(shot.shotVideo, SHOT_VIDEO_ORDER)
    }))
  };
}

export function summaryFormToShotPrompt(
  form: ShotPromptFormState,
  current: ShotPromptArtifact
): ShotPromptArtifact {
  return {
    ...current,
    aspectRatio: form.aspectRatio,
    prompt: form.prompt.trim(),
    negativePrompt: form.negativePrompt.trim(),
    tts: {
      ...current.tts,
      voiceProfile: normalizeVoiceProfile(form.voiceProfile)
    }
  };
}

export function formGoalToShotPrompt(
  form: ShotPromptFormState,
  current: ShotPromptArtifact,
  targetIndex: number
): ShotPromptArtifact {
  return {
    ...current,
    shots: form.shots.map((shot, shotIndex) => {
      const currentShot = current.shots[shotIndex] ?? current.shots[0]!;
      if (shotIndex !== targetIndex) return currentShot;
      return {
        ...currentShot,
        providerPrompt: shot.providerPrompt.trim()
      };
    })
  };
}

export function formLayerToShotPrompt(
  form: ShotPromptFormState,
  current: ShotPromptArtifact,
  targetIndex: number,
  layer: ShotPromptLayer
): ShotPromptArtifact {
  return {
    ...current,
    shots: form.shots.map((shot, shotIndex) => {
      const currentShot = current.shots[shotIndex] ?? current.shots[0]!;
      if (shotIndex !== targetIndex) return currentShot;
      return {
        ...currentShot,
        [layer]: formLayerToRecord(shot[layer], currentShot[layer]) ?? currentShot[layer]
      };
    })
  };
}
