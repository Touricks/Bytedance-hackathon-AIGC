export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.SERVER_PORT ?? 3000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  useRedisQueue: process.env.USE_REDIS_QUEUE === "true",
  runtime: process.env.SERVER_RUNTIME ?? "all"
};

export function shouldStartApi(): boolean {
  return config.runtime === "all" || config.runtime === "api";
}

export function shouldStartWorker(): boolean {
  return config.runtime === "all" || config.runtime === "worker";
}
