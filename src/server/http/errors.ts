export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STORAGE_ERROR"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      },
      { status: error.status },
    );
  }

  console.error("Unexpected server error", error instanceof Error ? error.message : error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado." } },
    { status: 500 },
  );
}

export function validationError(fields: Record<string, string>) {
  return new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", fields);
}
