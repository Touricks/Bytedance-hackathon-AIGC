export interface ReviewState {
  scriptId?: string;
  jobId?: string;
}

export function readReviewStateFromSearch(search: string): ReviewState {
  const params = new URLSearchParams(search);
  return {
    scriptId: params.get("scriptId") ?? undefined,
    jobId: params.get("jobId") ?? undefined
  };
}

export function buildReviewStateUrl(currentUrl: string, state: ReviewState) {
  const url = new URL(currentUrl);
  url.search = "";
  if (state.scriptId) {
    url.searchParams.set("scriptId", state.scriptId);
  }
  if (state.jobId) {
    url.searchParams.set("jobId", state.jobId);
  }
  return url.toString();
}

export function writeReviewStateToCurrentUrl(state: ReviewState) {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = buildReviewStateUrl(window.location.href, state);
  window.history.replaceState(null, "", nextUrl);
}
