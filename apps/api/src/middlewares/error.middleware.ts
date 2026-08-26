import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";
import { AppError } from "../errors/app-error";
import { logRequestError } from "../logging/logger";

function isInvalidJsonError(error: unknown) {
  return (
    error instanceof SyntaxError &&
    "status" in error &&
    (error as SyntaxError & { status?: number }).status === 400
  );
}

export const errorHandler: ErrorRequestHandler = (
  error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const normalizedError = isInvalidJsonError(error)
    ? new AppError(400, "INVALID_JSON", "El cuerpo JSON no es válido.")
    : error;

  if (normalizedError instanceof AppError) {
    if (normalizedError.statusCode >= 500) {
      logRequestError(normalizedError, req);
    }

    res.status(normalizedError.statusCode).json({
      error: {
        code: normalizedError.code,
        message: normalizedError.message,
        ...(normalizedError.details === undefined
          ? {}
          : { details: normalizedError.details }),
      },
    });
    return;
  }

  logRequestError(normalizedError, req);

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Ocurrió un error interno.",
    },
  });
};

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(
    new AppError(
      404,
      "ROUTE_NOT_FOUND",
      `No existe una ruta ${req.method} para este recurso.`
    )
  );
}
