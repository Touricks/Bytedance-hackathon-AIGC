export type FocusedStep =
  | "image_prompt"
  | "image_candidates"
  | "video_script"
  | "video_candidates"
  | "review"
  | "final_compose";

const ALLOWED_STEPS: readonly FocusedStep[] = [
  "image_prompt",
  "image_candidates",
  "video_script",
  "video_candidates",
  "review",
  "final_compose",
];

export interface ParsedWorkspaceUrl {
  workspaceId: string | null;
  shotId: string | null;
  step: FocusedStep | null;
}

export function parseWorkspaceUrl(
  pathname: string,
  search: string,
): ParsedWorkspaceUrl {
  const match = pathname.match(/^\/workspaces\/([^/]+)/);
  const workspaceId =
    match && match[1] ? decodeURIComponent(match[1]) : null;
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const stepRaw = params.get("step");
  const step =
    stepRaw && (ALLOWED_STEPS as readonly string[]).includes(stepRaw)
      ? (stepRaw as FocusedStep)
      : null;
  return { workspaceId, shotId: params.get("shot"), step };
}

export interface BuildWorkspaceUrlInput {
  workspaceId: string;
  shotId: string | null;
  step: FocusedStep | null;
}

export function buildWorkspaceUrl(input: BuildWorkspaceUrlInput): string {
  const params = new URLSearchParams();
  if (input.shotId) params.set("shot", input.shotId);
  if (input.step) params.set("step", input.step);
  const qs = params.toString();
  return `/workspaces/${encodeURIComponent(input.workspaceId)}${qs ? `?${qs}` : ""}`;
}
