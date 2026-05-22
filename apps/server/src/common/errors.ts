export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = "NotFoundError";
  }
}

export function toHttpError(error: unknown): { statusCode: number; message: string } {
  if (error instanceof NotFoundError) {
    return { statusCode: 404, message: error.message };
  }

  if (error instanceof Error) {
    return { statusCode: 400, message: error.message };
  }

  return { statusCode: 500, message: "Unknown server error" };
}
