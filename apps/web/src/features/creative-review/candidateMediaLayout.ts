export const CANDIDATE_MEDIA_FRAME_WIDTH = "clamp(132px, 10vw, 176px)";
export const DEFAULT_CANDIDATE_MEDIA_ASPECT_RATIO = "9 / 16";

export function cssAspectRatio(value: string | null | undefined) {
  const match = value?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return `${width} / ${height}`;
}

export function candidateMediaAspectRatio(value: string | null | undefined) {
  return cssAspectRatio(value) ?? DEFAULT_CANDIDATE_MEDIA_ASPECT_RATIO;
}
