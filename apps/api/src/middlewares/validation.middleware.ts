import type { RequestHandler } from "express";
import type { z } from "zod";
import { AppError } from "../errors/app-error";

export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(
        new AppError(400, "VALIDATION_ERROR", "La solicitud no es válida.", {
          fields: result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        })
      );
      return;
    }

    req.validatedBody = result.data;
    next();
  };
}
