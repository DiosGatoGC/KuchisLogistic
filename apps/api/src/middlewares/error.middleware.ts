import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(error);

  res.status(500).json({
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Internal server error",
  });
};