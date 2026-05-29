export async function pollUntil<T>(input: {
  label: string;
  intervalMs: number;
  timeoutMs: number;
  fetcher: () => Promise<T>;
  isDone: (v: T) => boolean;
}): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < input.timeoutMs) {
    const v = await input.fetcher();
    if (input.isDone(v)) return v;
    await new Promise((r) => setTimeout(r, input.intervalMs));
  }
  throw new Error(`Timeout while polling ${input.label}`);
}
