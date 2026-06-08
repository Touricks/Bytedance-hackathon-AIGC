/**
 * Run `worker` over `items` with at most `limit` calls in flight at once.
 * Results are returned in input order. Rejection from any worker propagates.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current] as T, current);
    }
  });
  await Promise.all(runners);
  return results;
}
