export interface UpstreamDrift {
  upstreamChanged: boolean;
  changedSources: string[];
}

export function compareSourceFingerprint(
  sourceFingerprint: unknown,
  currentSources: Record<string, string | null | undefined>,
): UpstreamDrift {
  if (!sourceFingerprint || typeof sourceFingerprint !== "object") {
    return { upstreamChanged: false, changedSources: [] };
  }

  const fingerprint = sourceFingerprint as Record<string, unknown>;
  const changedSources = Object.entries(currentSources)
    .filter(([, currentId]) => Boolean(currentId))
    .filter(([key, currentId]) => fingerprint[key] !== currentId)
    .map(([key]) => key);

  return {
    upstreamChanged: changedSources.length > 0,
    changedSources,
  };
}
