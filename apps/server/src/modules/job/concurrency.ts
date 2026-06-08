/**
 * Resolve the BullMQ worker concurrency for the generation queue.
 *
 * Candidate count limits are separate from queue execution and provider gates:
 * this value only decides how many `generation` jobs one worker may run at
 * the same time. Text, image, and video provider calls are each capped again by
 * provider-specific semaphores.
 */
export function resolveWorkerConcurrency(input: {
  generationWorkerConcurrency: number;
}): number {
  const governed = Math.floor(input.generationWorkerConcurrency);
  if (!Number.isFinite(governed) || governed < 1) {
    return 1;
  }
  return governed;
}
