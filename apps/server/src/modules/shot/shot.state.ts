export type ShotStatus =
  | "DRAFT"
  | "IMAGE_PROMPT_PROPOSING"
  | "IMAGE_PROMPT_READY"
  | "IMAGE_PROMPT_EDITED"
  | "IMAGE_GENERATING"
  | "IMAGE_CANDIDATES_READY"
  | "IMAGE_SELECTED"
  | "VIDEO_SCRIPT_PROPOSING"
  | "VIDEO_SCRIPT_READY"
  | "VIDEO_SCRIPT_EDITED"
  | "VIDEO_GENERATING"
  | "VIDEO_CANDIDATES_READY"
  | "VIDEO_SELECTED"
  | "FAILED";

export type NextAction =
  | "GENERATE_IMAGE_PROMPT"
  | "EDIT_IMAGE_PROMPT"
  | "GENERATE_IMAGES"
  | "POLL_IMAGE_BATCH"
  | "SELECT_IMAGE"
  | "GENERATE_VIDEO_SCRIPT"
  | "EDIT_VIDEO_SCRIPT"
  | "GENERATE_VIDEOS"
  | "POLL_VIDEO_BATCH"
  | "SELECT_VIDEO"
  | "READY_FOR_FINAL_COMPOSE"
  | "RETRY"
  | "NONE";

export type ShotEvent =
  | "PROPOSE_IMAGE_PROMPT"
  | "USER_EDIT_IMAGE_PROMPT"
  | "ENQUEUE_IMAGE_BATCH"
  | "IMAGE_BATCH_DONE_OK"
  | "IMAGE_BATCH_FAILED"
  | "USER_SELECT_IMAGE"
  | "PROPOSE_VIDEO_SCRIPT"
  | "USER_EDIT_VIDEO_SCRIPT"
  | "ENQUEUE_VIDEO_BATCH"
  | "VIDEO_BATCH_DONE_OK"
  | "VIDEO_BATCH_FAILED"
  | "USER_SELECT_VIDEO";

export function getNextAction(status: ShotStatus): NextAction {
  switch (status) {
    case "DRAFT":
      return "GENERATE_IMAGE_PROMPT";
    case "IMAGE_PROMPT_PROPOSING":
    case "VIDEO_SCRIPT_PROPOSING":
      return "NONE";
    case "IMAGE_PROMPT_READY":
    case "IMAGE_PROMPT_EDITED":
      return "GENERATE_IMAGES";
    case "IMAGE_GENERATING":
      return "POLL_IMAGE_BATCH";
    case "IMAGE_CANDIDATES_READY":
      return "SELECT_IMAGE";
    case "IMAGE_SELECTED":
      return "GENERATE_VIDEO_SCRIPT";
    case "VIDEO_SCRIPT_READY":
      return "EDIT_VIDEO_SCRIPT";
    case "VIDEO_SCRIPT_EDITED":
      return "GENERATE_VIDEOS";
    case "VIDEO_GENERATING":
      return "POLL_VIDEO_BATCH";
    case "VIDEO_CANDIDATES_READY":
      return "SELECT_VIDEO";
    case "VIDEO_SELECTED":
      return "READY_FOR_FINAL_COMPOSE";
    case "FAILED":
      return "RETRY";
  }
}

const allowed: ReadonlyMap<ShotStatus, ReadonlySet<ShotStatus>> = new Map([
  ["DRAFT", new Set<ShotStatus>(["IMAGE_PROMPT_PROPOSING"])],
  ["IMAGE_PROMPT_PROPOSING", new Set<ShotStatus>(["IMAGE_PROMPT_READY", "FAILED"])],
  ["IMAGE_PROMPT_READY", new Set<ShotStatus>(["IMAGE_PROMPT_EDITED", "IMAGE_GENERATING"])],
  ["IMAGE_PROMPT_EDITED", new Set<ShotStatus>(["IMAGE_GENERATING"])],
  ["IMAGE_GENERATING", new Set<ShotStatus>(["IMAGE_CANDIDATES_READY", "FAILED"])],
  ["IMAGE_CANDIDATES_READY", new Set<ShotStatus>(["IMAGE_PROMPT_EDITED", "IMAGE_SELECTED"])],
  ["IMAGE_SELECTED", new Set<ShotStatus>(["VIDEO_SCRIPT_PROPOSING", "IMAGE_PROMPT_EDITED"])],
  ["VIDEO_SCRIPT_PROPOSING", new Set<ShotStatus>(["VIDEO_SCRIPT_READY", "FAILED"])],
  ["VIDEO_SCRIPT_READY", new Set<ShotStatus>(["VIDEO_SCRIPT_EDITED", "VIDEO_GENERATING"])],
  ["VIDEO_SCRIPT_EDITED", new Set<ShotStatus>(["VIDEO_GENERATING"])],
  ["VIDEO_GENERATING", new Set<ShotStatus>(["VIDEO_CANDIDATES_READY", "FAILED"])],
  ["VIDEO_CANDIDATES_READY", new Set<ShotStatus>(["VIDEO_SCRIPT_EDITED", "VIDEO_SELECTED"])],
  ["VIDEO_SELECTED", new Set<ShotStatus>(["IMAGE_PROMPT_EDITED", "VIDEO_SCRIPT_EDITED"])],
  ["FAILED", new Set<ShotStatus>(["IMAGE_GENERATING", "VIDEO_GENERATING"])],
]);

export function canTransition(from: ShotStatus, to: ShotStatus): boolean {
  return allowed.get(from)?.has(to) ?? false;
}

export function nextStatusAfter(event: ShotEvent, from: ShotStatus): ShotStatus {
  switch (event) {
    case "PROPOSE_IMAGE_PROMPT":
      return "IMAGE_PROMPT_PROPOSING";
    case "USER_EDIT_IMAGE_PROMPT":
      return "IMAGE_PROMPT_EDITED";
    case "ENQUEUE_IMAGE_BATCH":
      return "IMAGE_GENERATING";
    case "IMAGE_BATCH_DONE_OK":
      return "IMAGE_CANDIDATES_READY";
    case "IMAGE_BATCH_FAILED":
      return "FAILED";
    case "USER_SELECT_IMAGE":
      return "IMAGE_SELECTED";
    case "PROPOSE_VIDEO_SCRIPT":
      return "VIDEO_SCRIPT_PROPOSING";
    case "USER_EDIT_VIDEO_SCRIPT":
      return "VIDEO_SCRIPT_EDITED";
    case "ENQUEUE_VIDEO_BATCH":
      return "VIDEO_GENERATING";
    case "VIDEO_BATCH_DONE_OK":
      return "VIDEO_CANDIDATES_READY";
    case "VIDEO_BATCH_FAILED":
      return "FAILED";
    case "USER_SELECT_VIDEO":
      return "VIDEO_SELECTED";
  }
  // unreachable
  return from;
}
