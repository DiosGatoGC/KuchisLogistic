import type { Request } from "express";

export function logRequestError(error: unknown, req: Request) {
  const normalizedError =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          cause:
            error.cause instanceof Error
              ? {
                  name: error.cause.name,
                  message: error.cause.message,
                }
              : undefined,
        }
      : { name: "UnknownError" };

  console.error({
    event: "api_request_failed",
    method: req.method,
    path: req.path,
    error: normalizedError,
  });
}
