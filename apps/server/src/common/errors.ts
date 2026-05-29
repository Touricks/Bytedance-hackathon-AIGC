export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = "NotFoundError";
  }
}

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  constructor(statusCode: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface ScriptTraceError extends Error {
  scriptId?: string;
}

export function toHttpError(error: unknown): {
  statusCode: number;
  message: string;
  code?: string;
  scriptId?: string;
} {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, message: error.message, code: error.code };
  }
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
