export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = "NotFoundError";
  }
}

interface ScriptTraceError extends Error {
  scriptId?: string;
}

export function toHttpError(error: unknown): {
  statusCode: number;
  message: string;
  scriptId?: string;
} {
  if (error instanceof NotFoundError) {
    return { statusCode: 404, message: error.message };
  }

  if (error instanceof Error) {
    const traceError = error as ScriptTraceError;
    return {
      statusCode: 400,
      message: error.message,
      scriptId: traceError.scriptId
    };
  }

  return { statusCode: 500, message: "Unknown server error" };
}
