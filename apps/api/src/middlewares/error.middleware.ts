import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import type { ApiLogger } from "../logging/logger";
import { safeErrorType } from "../logging/logger";

interface ParserErrorLike {
  status?: unknown;
  type?: unknown;
}

function parserError(error: unknown, status: number, type: string) {
  if (!error || typeof error !== "object") return false;
  const value = error as ParserErrorLike;
  return value.status === status && value.type === type;
}

function normalizeError(error: unknown) {
  if (parserError(error, 413, "entity.too.large")) {
    return new AppError(413, "PAYLOAD_TOO_LARGE", "El cuerpo de la solicitud es demasiado grande.");
  }
  if (parserError(error, 400, "entity.parse.failed")) {
    return new AppError(400, "INVALID_JSON", "El cuerpo JSON no es válido.");
  }
  return error;
}

function validationDetails(error: AppError) {
  if (error.code !== "VALIDATION_ERROR" || !error.details || typeof error.details !== "object") {
    return undefined;
  }
  const fields = (error.details as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return undefined;
  const safeFields = fields.flatMap((field) => {
    if (!field || typeof field !== "object") return [];
    const value = field as { path?: unknown; message?: unknown };
    if (typeof value.path !== "string" || typeof value.message !== "string") return [];
    return [{ path: value.path.slice(0, 120), message: value.message.slice(0, 240) }];
  });
  return { fields: safeFields };
}

export function createErrorHandler(logger: ApiLogger): ErrorRequestHandler {
  return (error, req: Request, res: Response, _next: NextFunction) => {
    const normalized = normalizeError(error);
    const appError = normalized instanceof AppError ? normalized : null;
    const status = appError?.statusCode ?? 500;
    const code = appError?.code ?? "INTERNAL_SERVER_ERROR";

    logger.error({
      event: "api_request_failed",
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      pathname: req.path,
      status,
      code,
      errorType: safeErrorType(normalized),
    });

    if (appError) {
      const details = validationDetails(appError);
      res.status(status).json({
        error: {
          code,
          message: appError.message,
          ...(details ? { details } : {}),
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code,
        message: "Ocurrió un error interno.",
      },
    });
  };
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(
    new AppError(
      404,
      "ROUTE_NOT_FOUND",
      `No existe una ruta ${req.method} para este recurso.`
    )
  );
}
