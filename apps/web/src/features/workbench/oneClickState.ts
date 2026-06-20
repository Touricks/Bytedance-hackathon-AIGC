import type { OneClickFinalVideoJob } from "../../lib/api/oneClickFinalVideo.js";

export const ACTIVE_ONE_CLICK_STATUSES = new Set<
  OneClickFinalVideoJob["status"]
>(["PENDING", "RUNNING", "WAITING"]);

export function isActiveOneClickStatus(
  status: OneClickFinalVideoJob["status"],
) {
  return ACTIVE_ONE_CLICK_STATUSES.has(status);
}

export function oneClickPollingInterval(input: {
  statusActiveJob: OneClickFinalVideoJob | null | undefined;
  jobs: OneClickFinalVideoJob[];
}) {
  return (input.statusActiveJob &&
    isActiveOneClickStatus(input.statusActiveJob.status)) ||
    input.jobs.some((job) => isActiveOneClickStatus(job.status))
    ? 5_000
    : 15_000;
}

/**
 * Poll the workspace-status query while a one-click final-video job is running.
 * The one-click pipeline advances artifacts (brief → storyboard → … → final)
 * entirely server-side with no per-step frontend mutation, so without this the
 * artifact-derived step indicators stay frozen until a manual refresh. Returns
 * `false` to disable polling once no one-click job is active.
 */
export function workspaceStatusRefetchInterval(input: {
  activeOneClickFinalVideo: OneClickFinalVideoJob | null | undefined;
  activeModuleRunCount?: number;
}): number | false {
  const job = input.activeOneClickFinalVideo;
  return (job && isActiveOneClickStatus(job.status)) ||
    (input.activeModuleRunCount ?? 0) > 0
    ? 3_000
    : false;
}

export function resolveOneClickFinalVideoState(input: {
  statusActiveJob: OneClickFinalVideoJob | null | undefined;
  jobs: OneClickFinalVideoJob[];
  mutationPending: boolean;
}) {
  const matchingListJob = input.statusActiveJob
    ? input.jobs.find((job) => job.id === input.statusActiveJob?.id) ?? null
    : null;
  const reconciledStatusJob =
    matchingListJob && !isActiveOneClickStatus(matchingListJob.status)
      ? matchingListJob
      : (input.statusActiveJob ?? null);
  const activeJob =
    (reconciledStatusJob &&
    isActiveOneClickStatus(reconciledStatusJob.status)
      ? reconciledStatusJob
      : null) ??
    input.jobs.find((job) => isActiveOneClickStatus(job.status)) ??
    null;
  const displayJob =
    activeJob ?? matchingListJob ?? input.jobs[0] ?? reconciledStatusJob ?? null;

  return {
    activeJob,
    displayJob,
    hasActiveJob:
      input.mutationPending ||
      Boolean(activeJob && isActiveOneClickStatus(activeJob.status)),
  };
}
