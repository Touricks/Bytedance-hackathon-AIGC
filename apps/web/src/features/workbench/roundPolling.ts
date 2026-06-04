const TERMINAL_BATCH_STATUSES = new Set([
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

export interface PollableRound {
  batch: {
    id: string;
    status: string;
  } | null;
}
export function roundPollingInterval(input: {
  activeBatchId: string | null | undefined;
  rounds: PollableRound[] | null | undefined;
  intervalMs: number;
}) {
  if (!input.activeBatchId) return false;

  const activeRound = input.rounds?.find(
    (round) => round.batch?.id === input.activeBatchId,
  );
  if (!activeRound?.batch) return input.intervalMs;

  return TERMINAL_BATCH_STATUSES.has(activeRound.batch.status)
    ? false
    : input.intervalMs;
}
