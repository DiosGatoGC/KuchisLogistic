import type { Request } from "express";

function normalizeCause(cause: unknown) {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message };
  }

  if (typeof cause === "object" && cause !== null) {
    const external = cause as Record<string, unknown>;
    return {
      name: "ExternalServiceError",
      code: typeof external.code === "string" ? external.code : undefined,
      status:
        typeof external.status === "number" ? external.status : undefined,
      message:
        typeof external.message === "string" ? external.message : undefined,
      hint: typeof external.hint === "string" ? external.hint : undefined,
    };
  }

  return undefined;
}

export function logRequestError(error: unknown, req: Request) {
  const normalizedError =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          cause: normalizeCause(error.cause),
        }
      : { name: "UnknownError" };

  console.error({
    event: "api_request_failed",
    method: req.method,
    path: req.path,
    error: normalizedError,
  });
}
