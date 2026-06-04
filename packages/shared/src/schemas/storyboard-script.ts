import type { StoryboardArtifact } from "./artifacts.js";

export const STORYBOARD_SCRIPT_TOTAL_DURATION_SEC = 15;
export const STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC = 4;
export const STORYBOARD_SCRIPT_DEFAULT_DURATIONS = [4, 7, 4] as const;
export const STORYBOARD_SCRIPT_DEFAULT_PURPOSES = ["hook", "proof", "cta"] as const;
export const STORYBOARD_SCRIPT_VOICEOVER_CHARS_PER_SEC = 5;

export type P0StoryboardScriptIssueCode =
  | "shot_count"
  | "total_duration"
  | "shot_duration"
  | "shot_purpose"
  | "voiceover_over_limit";

export interface P0StoryboardScriptIssue {
  code: P0StoryboardScriptIssueCode;
  path: string;
  message: string;
}

export interface P0StoryboardScriptShotAnalysis {
  index: number;
  durationSec: number;
  voiceoverCount: number;
  voiceoverLimit: number;
  voiceoverOverLimit: boolean;
}

export interface P0StoryboardScriptValidation {
  valid: boolean;
  durations: number[];
  shots: P0StoryboardScriptShotAnalysis[];
  issues: P0StoryboardScriptIssue[];
}

export function storyboardScriptVoiceoverCount(value: string) {
  return Array.from(value.replace(/\s+/g, "")).length;
}

export function storyboardScriptVoiceoverLimit(durationSec: number) {
  return durationSec * STORYBOARD_SCRIPT_VOICEOVER_CHARS_PER_SEC;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function redistributeP0StoryboardDurations(
  durations: readonly number[],
  dividerIndex: number,
  deltaSec: number,
) {
  const next = durations.map((durationSec) => Math.round(durationSec));
  const leftIndex = dividerIndex;
  const rightIndex = dividerIndex + 1;
  const left = next[leftIndex];
  const right = next[rightIndex];
  if (
    left === undefined ||
    right === undefined ||
    left < STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC ||
    right < STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC
  ) {
    return next;
  }

  const pairTotal = left + right;
  const nextLeft = clampInteger(
    left + deltaSec,
    STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC,
    pairTotal - STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC,
  );
  next[leftIndex] = nextLeft;
  next[rightIndex] = pairTotal - nextLeft;
  return next;
}

export function validateP0StoryboardScript(
  storyboard: StoryboardArtifact,
): P0StoryboardScriptValidation {
  const issues: P0StoryboardScriptIssue[] = [];
  const durations = storyboard.shots.map((shot) => shot.durationSec);
  const shots = storyboard.shots.map((shot, position) => {
    const voiceoverCount = storyboardScriptVoiceoverCount(shot.voiceover);
    const voiceoverLimit = storyboardScriptVoiceoverLimit(shot.durationSec);
    const voiceoverOverLimit = voiceoverCount > voiceoverLimit;

    if (shot.durationSec < STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC) {
      issues.push({
        code: "shot_duration",
        path: `shots[${position}].durationSec`,
        message: `分镜 ${position + 1} 时长不能少于 ${STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC} 秒。`,
      });
    }

    if (shot.purpose !== STORYBOARD_SCRIPT_DEFAULT_PURPOSES[position]) {
      issues.push({
        code: "shot_purpose",
        path: `shots[${position}].purpose`,
        message: `分镜 ${position + 1} 目的需匹配 P0 默认结构。`,
      });
    }

    if (voiceoverOverLimit) {
      issues.push({
        code: "voiceover_over_limit",
        path: `shots[${position}].voiceover`,
        message: `口播过长，${shot.durationSec} 秒内建议不超过 ${voiceoverLimit} 字。`,
      });
    }

    return {
      index: shot.index,
      durationSec: shot.durationSec,
      voiceoverCount,
      voiceoverLimit,
      voiceoverOverLimit,
    };
  });

  if (storyboard.shots.length !== STORYBOARD_SCRIPT_DEFAULT_DURATIONS.length) {
    issues.unshift({
      code: "shot_count",
      path: "shots",
      message: `分镜脚本需要固定 ${STORYBOARD_SCRIPT_DEFAULT_DURATIONS.length} 镜。`,
    });
  }

  const durationSum = durations.reduce((sum, durationSec) => sum + durationSec, 0);
  if (
    storyboard.totalDurationSec !== STORYBOARD_SCRIPT_TOTAL_DURATION_SEC ||
    durationSum !== STORYBOARD_SCRIPT_TOTAL_DURATION_SEC
  ) {
    issues.push({
      code: "total_duration",
      path: "totalDurationSec",
      message: `分镜脚本总时长需固定为 ${STORYBOARD_SCRIPT_TOTAL_DURATION_SEC} 秒。`,
    });
  }

  return {
    valid: issues.length === 0,
    durations,
    shots,
    issues,
  };
}
