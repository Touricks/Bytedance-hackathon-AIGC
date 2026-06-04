import {
  __setProviderConcurrencyForTests,
  providerConcurrencyStats,
  runWithProviderSlot
} from "./provider-concurrency.js";

/**
 * Run `fn` while holding one of the `VIDEO_PROVIDER_CONCURRENCY` slots.
 * Releases the slot when `fn` settles (resolve or reject).
 */
export function runWithVideoSlot<T>(fn: () => Promise<T>): Promise<T> {
  return runWithProviderSlot("video", fn);
}

export function videoConcurrencyStats(): { active: number; queued: number } {
  const stats = providerConcurrencyStats("video");
  return { active: stats.active, queued: stats.queued };
}

/**
 * Test hook: override the video provider cap and force the singleton to be
 * re-created so the new limit takes effect. Pass `undefined` to restore env.
 */
export function __setVideoConcurrencyForTests(limit: number | undefined): void {
  __setProviderConcurrencyForTests("video", limit);
}
