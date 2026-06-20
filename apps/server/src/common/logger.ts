import pino from "pino";
import { redactTraceValue } from "@aigc-video/ai";

function normalizeLogValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeLogValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        normalizeLogValue(nested),
      ]),
    );
  }
  return value;
}

function safeMeta(meta?: Record<string, unknown>) {
  return meta
    ? (redactTraceValue(normalizeLogValue(meta)) as Record<string, unknown>)
    : undefined;
}

const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.apiKey",
      "*.api_key",
      "*.token",
      "*.secret",
      "*.authorization",
      "*.Authorization",
      "*.providerTemporaryUrl",
    ],
    censor: "<redacted>",
  },
});

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    pinoLogger.info(safeMeta(meta), message);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    pinoLogger.warn(safeMeta(meta), message);
  },
  error(message: string, meta?: Record<string, unknown>) {
    pinoLogger.error(safeMeta(meta), message);
  },
};
