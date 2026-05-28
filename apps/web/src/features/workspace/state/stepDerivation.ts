import type { FocusedStep } from "./urlState.js";
import type { ShotStatus } from "../../../lib/api/client.js";

export function defaultStepForStatus(status: ShotStatus): FocusedStep {
  switch (status) {
    case "DRAFT":
    case "IMAGE_PROMPT_PROPOSING":
    case "IMAGE_PROMPT_READY":
    case "IMAGE_PROMPT_EDITED":
      return "image_prompt";
    case "IMAGE_GENERATING":
    case "IMAGE_CANDIDATES_READY":
      return "image_candidates";
    case "IMAGE_SELECTED":
    case "VIDEO_SCRIPT_PROPOSING":
    case "VIDEO_SCRIPT_READY":
    case "VIDEO_SCRIPT_EDITED":
      return "video_script";
    case "VIDEO_GENERATING":
    case "VIDEO_CANDIDATES_READY":
      return "video_candidates";
    case "VIDEO_SELECTED":
      return "review";
    case "FAILED":
      return "image_prompt";
  }
}

const STEP_ORDER: FocusedStep[] = [
  "image_prompt",
  "image_candidates",
  "video_script",
  "video_candidates",
  "review",
];

function statusRank(status: ShotStatus): number {
  switch (status) {
    case "DRAFT":
    case "IMAGE_PROMPT_PROPOSING":
    case "IMAGE_PROMPT_READY":
    case "IMAGE_PROMPT_EDITED":
      return 0;
    case "IMAGE_GENERATING":
    case "IMAGE_CANDIDATES_READY":
      return 1;
    case "IMAGE_SELECTED":
    case "VIDEO_SCRIPT_PROPOSING":
    case "VIDEO_SCRIPT_READY":
    case "VIDEO_SCRIPT_EDITED":
      return 2;
    case "VIDEO_GENERATING":
    case "VIDEO_CANDIDATES_READY":
      return 3;
    case "VIDEO_SELECTED":
      return 4;
    case "FAILED":
      return 0;
  }
}

export function isStepReachable(
  step: FocusedStep,
  status: ShotStatus,
): boolean {
  if (step === "final_compose") return false; // workspace-level CTA, not a shot step
  const i = STEP_ORDER.indexOf(step);
  return i >= 0 && i <= statusRank(status);
}
