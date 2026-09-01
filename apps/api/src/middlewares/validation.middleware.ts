import type { RequestHandler } from "express";
import type { z } from "zod";
import { AppError } from "../errors/app-error";

type ValidationSource = "body" | "params" | "query";

function validate(schema: z.ZodType, source: ValidationSource): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

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

    if (source === "body") req.validatedBody = result.data;
    if (source === "params") req.validatedParams = result.data;
    if (source === "query") req.validatedQuery = result.data;
    next();
  };
}

export function validateBody(schema: z.ZodType): RequestHandler {
  return validate(schema, "body");
}

export function validateParams(schema: z.ZodType): RequestHandler {
  return validate(schema, "params");
}

export function validateQuery(schema: z.ZodType): RequestHandler {
  return validate(schema, "query");
}
