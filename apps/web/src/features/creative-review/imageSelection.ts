/**
 * Pure decision helpers for the "select then confirm" image candidate flow.
 *
 * Clicking a candidate only *stages* it locally; committing the selection to
 * the backend happens through a separate confirm action. Keeping the decision
 * logic here lets it be unit-tested without rendering the React component.
 */

export interface SelectableCandidate {
  id: string;
  status: string;
}

/** A candidate can only be staged once its generation has SUCCEEDED. */
export function isSelectableCandidate(status: string): boolean {
  return status === "SUCCEEDED";
}

/**
 * Resolve the next staged candidate id after a click. Clicks on candidates
 * that are not ready (or that do not exist) leave the current staging intact.
 */
export function stageCandidate(
  current: string | null,
  clickedId: string,
  candidates: SelectableCandidate[],
): string | null {
  const clicked = candidates.find((candidate) => candidate.id === clickedId);
  if (!clicked || !isSelectableCandidate(clicked.status)) {
    return current;
  }
  return clickedId;
}

/**
 * The confirm action is enabled only when a staged candidate differs from the
 * already committed selection and no request is in flight.
 */
export function canConfirmSelection(input: {
  stagedId: string | null;
  committedId: string | null;
  busy: boolean;
}): boolean {
  if (input.busy || input.stagedId === null) {
    return false;
  }
  return input.stagedId !== input.committedId;
}
