import pino from "pino";

export const pinoLogger = pino({
  base: null,
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "*.apiKey",
      "*.accessKey",
      "*.secret",
      "*.secretKey",
      "*.token",
      "*.authorization",
      "*.providerTemporaryUrl",
      "err.config.headers.authorization",
    ],
    censor: "<redacted>",
  },
});

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    pinoLogger.info(meta ?? {}, message);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    pinoLogger.warn(meta ?? {}, message);
  },
  error(message: string, meta?: Record<string, unknown>) {
    pinoLogger.error(meta ?? {}, message);
  }
};
