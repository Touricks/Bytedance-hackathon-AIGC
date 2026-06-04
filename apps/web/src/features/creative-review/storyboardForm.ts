import {
  STORYBOARD_SCRIPT_DEFAULT_DURATIONS,
  STORYBOARD_SCRIPT_DEFAULT_PURPOSES,
  STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC,
  STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
  storyboardScriptVoiceoverLimit
} from "@aigc-video/shared";
import type { StoryboardArtifact } from "@aigc-video/shared";

export function linesFromText(value: string) {
  return value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export type StoryboardShotFormState = {
  purpose: string;
  durationSec: string;
  scene: string;
  visualDirection: string;
  productAssetRef: string;
  voiceover: string;
  transition: string;
};

export type StoryboardFormState = {
  narrative: string;
  totalDurationSec: string;
  assumptions: string;
  shots: StoryboardShotFormState[];
};

function compactText(values: Array<string | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("；");
}

function storyboardScriptFormShots(storyboard: StoryboardArtifact) {
  if (storyboard.shots.length === STORYBOARD_SCRIPT_DEFAULT_DURATIONS.length) {
    return storyboard.shots;
  }

  const firstShot = storyboard.shots[0];
  const lastShot = storyboard.shots.at(-1) ?? firstShot;
  const proofShots =
    storyboard.shots.length > 2
      ? storyboard.shots.slice(1, -1)
      : storyboard.shots.slice(1);
  const proofBase = proofShots[0] ?? lastShot ?? firstShot;
  const materialRef =
    firstShot?.productAssetRef ||
    proofBase?.productAssetRef ||
    lastShot?.productAssetRef ||
    "";

  return [firstShot, proofBase, lastShot].map((shot, index) => {
    const source = shot ?? firstShot ?? proofBase ?? lastShot;
    return {
      ...source,
      index,
      purpose: STORYBOARD_SCRIPT_DEFAULT_PURPOSES[index]!,
      durationSec: STORYBOARD_SCRIPT_DEFAULT_DURATIONS[index]!,
      productAssetRef: source?.productAssetRef || materialRef,
      scene:
        index === 1
          ? compactText(proofShots.map((item) => item.scene)) || source?.scene || ""
          : source?.scene || "",
      visualDirection:
        index === 1
          ? compactText(proofShots.map((item) => item.visualDirection)) ||
            source?.visualDirection ||
            ""
          : source?.visualDirection || "",
      voiceover:
        index === 1
          ? compactText(proofShots.map((item) => item.voiceover)) ||
            source?.voiceover ||
            ""
          : source?.voiceover || ""
    };
  });
}

export function storyboardToForm(storyboard: StoryboardArtifact): StoryboardFormState {
  const shots = storyboardScriptFormShots(storyboard);
  return {
    narrative: storyboard.narrative,
    totalDurationSec: String(STORYBOARD_SCRIPT_TOTAL_DURATION_SEC),
    assumptions: storyboard.assumptions.join("\n"),
    shots: shots.map((shot, index) => ({
      purpose: shot.purpose,
      durationSec: String(
        storyboard.shots.length === STORYBOARD_SCRIPT_DEFAULT_DURATIONS.length
          ? shot.durationSec
          : STORYBOARD_SCRIPT_DEFAULT_DURATIONS[index]
      ),
      scene: shot.scene,
      visualDirection: shot.visualDirection,
      productAssetRef: shot.productAssetRef,
      voiceover: shot.voiceover,
      transition: shot.transition ?? ""
    }))
  };
}

export function normalizeStoryboardPurpose(
  value: string,
  fallback: StoryboardArtifact["shots"][number]["purpose"]
): StoryboardArtifact["shots"][number]["purpose"] {
  if (value === "benefit") return "proof";
  return ["hook", "proof", "cta"].includes(value)
    ? (value as StoryboardArtifact["shots"][number]["purpose"])
    : fallback;
}

export function storyboardPurposeLabel(
  purpose: StoryboardArtifact["shots"][number]["purpose"]
) {
  switch (purpose) {
    case "hook":
      return "开场钩子";
    case "benefit":
      return "卖点证明";
    case "proof":
      return "卖点证明";
    case "cta":
      return "行动号召";
  }
}

export function storyboardTiming(shots: StoryboardArtifact["shots"]) {
  let cursor = 0;
  return shots.map((shot) => {
    const start = cursor;
    const end = start + shot.durationSec;
    cursor = end;
    return { start, end };
  });
}

function positiveIntegerFromText(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function formToStoryboard(
  form: StoryboardFormState,
  current: StoryboardArtifact
): StoryboardArtifact {
  return {
    ...current,
    narrative: form.narrative.trim(),
    totalDurationSec: STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
    assumptions: linesFromText(form.assumptions),
    shots: form.shots.map((shot, index) => {
      const currentShot = current.shots[index] ?? current.shots[0]!;
      return {
        ...currentShot,
        index,
        purpose: normalizeStoryboardPurpose(shot.purpose, currentShot.purpose),
        durationSec: positiveIntegerFromText(shot.durationSec, currentShot.durationSec),
        scene: shot.scene.trim(),
        visualDirection: shot.visualDirection.trim(),
        productAssetRef: shot.productAssetRef.trim(),
        voiceover: shot.voiceover.trim(),
        transition: shot.transition.trim()
      };
    })
  };
}

function clampTextToEffectiveChars(value: string, limit: number) {
  const chars: string[] = [];
  let count = 0;
  for (const char of Array.from(value.trim())) {
    if (!/\s/.test(char)) count += 1;
    if (count > limit) break;
    chars.push(char);
  }
  return chars.join("").trim();
}

export function fitStoryboardVoiceoversToBudget(form: StoryboardFormState) {
  return {
    ...form,
    shots: form.shots.map((shot) => {
      const durationSec = positiveIntegerFromText(
        shot.durationSec,
        STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC
      );
      const limit = storyboardScriptVoiceoverLimit(durationSec);
      const source =
        shot.voiceover.trim() || shot.scene.trim() || shot.visualDirection.trim();
      return {
        ...shot,
        voiceover: clampTextToEffectiveChars(source, limit)
      };
    })
  };
}

export function applyStoryboardDurationAllocation(
  form: StoryboardFormState,
  durations: readonly number[]
) {
  return {
    ...form,
    totalDurationSec: String(STORYBOARD_SCRIPT_TOTAL_DURATION_SEC),
    shots: form.shots.map((shot, index) => ({
      ...shot,
      durationSec: String(
        durations[index] ??
          positiveIntegerFromText(
            shot.durationSec,
            STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC
          )
      )
    }))
  };
}
