export type CandidateCountKind = "image" | "video";

export interface CandidateCountPreferences {
  image?: number;
  video?: number;
}

interface CandidateCountStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function candidateCountStorageKey(workspaceId: string) {
  return `aigc:candidateCounts:${workspaceId}`;
}

export function clampCandidateCount(input: {
  value: number | undefined;
  fallback: number;
  max: number;
}) {
  const value = Number.isFinite(input.value) ? Number(input.value) : input.fallback;
  return Math.min(Math.max(Math.trunc(value), 1), input.max);
}

export function readCandidateCountPreferences(
  storage: CandidateCountStorage | null | undefined,
  workspaceId: string,
): CandidateCountPreferences {
  if (!storage) return {};
  const raw = storage.getItem(candidateCountStorageKey(workspaceId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as CandidateCountPreferences;
    return {
      image: typeof parsed.image === "number" ? parsed.image : undefined,
      video: typeof parsed.video === "number" ? parsed.video : undefined,
    };
  } catch {
    return {};
  }
}

export function writeCandidateCountPreference(input: {
  storage: CandidateCountStorage | null | undefined;
  workspaceId: string;
  kind: CandidateCountKind;
  value: number;
}) {
  if (!input.storage) return;
  const current = readCandidateCountPreferences(input.storage, input.workspaceId);
  input.storage.setItem(
    candidateCountStorageKey(input.workspaceId),
    JSON.stringify({ ...current, [input.kind]: input.value }),
  );
}
