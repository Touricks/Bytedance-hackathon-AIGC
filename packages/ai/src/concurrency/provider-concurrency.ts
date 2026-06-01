export type ProviderKind = "text" | "image" | "video";

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.active -= 1;
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.waiters.length;
  }
}

const instances = new Map<ProviderKind, Semaphore>();
const limitOverrides = new Map<ProviderKind, number | undefined>();

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function defaultLimit(kind: ProviderKind): number {
  switch (kind) {
    case "text":
      return positiveInt(process.env.TEXT_PROVIDER_CONCURRENCY, 20);
    case "image": {
      const maxCandidates = positiveInt(process.env.MAX_IMAGE_CANDIDATES_PER_SHOT, 6);
      return positiveInt(process.env.IMAGE_PROVIDER_CONCURRENCY, maxCandidates * 2);
    }
    case "video":
      return positiveInt(process.env.VIDEO_PROVIDER_CONCURRENCY, 5);
  }
}

function getLimit(kind: ProviderKind): number {
  const override = limitOverrides.get(kind);
  return override ?? defaultLimit(kind);
}

function getSemaphore(kind: ProviderKind): Semaphore {
  let semaphore = instances.get(kind);
  if (!semaphore) {
    semaphore = new Semaphore(getLimit(kind));
    instances.set(kind, semaphore);
  }
  return semaphore;
}

export function runWithProviderSlot<T>(
  kind: ProviderKind,
  fn: () => Promise<T>
): Promise<T> {
  return getSemaphore(kind).run(fn);
}

export function providerConcurrencyStats(kind: ProviderKind): {
  active: number;
  queued: number;
  limit: number;
} {
  const semaphore = getSemaphore(kind);
  return {
    active: semaphore.activeCount,
    queued: semaphore.queuedCount,
    limit: getLimit(kind)
  };
}

export function __setProviderConcurrencyForTests(
  kind: ProviderKind,
  limit: number | undefined
): void {
  limitOverrides.set(kind, limit);
  instances.delete(kind);
}
