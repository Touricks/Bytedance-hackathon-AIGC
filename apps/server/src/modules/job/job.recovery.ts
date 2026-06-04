const QUEUE_STATES_THAT_CAN_STILL_FINISH = new Set([
  "active",
  "delayed",
  "paused",
  "prioritized",
  "waiting",
  "waiting-children",
]);

export function shouldReenqueueInflightJob(input: {
  useRedisQueue: boolean;
  queueJobId: string | null;
  queueJobState: string | null;
}) {
  if (!input.useRedisQueue) {
    return true;
  }
  if (!input.queueJobId) {
    return true;
  }
  if (!input.queueJobState) {
    return true;
  }
  return !QUEUE_STATES_THAT_CAN_STILL_FINISH.has(input.queueJobState);
}
