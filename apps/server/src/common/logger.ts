export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.info(message, meta ?? "");
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(message, meta ?? "");
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(message, meta ?? "");
  }
};
