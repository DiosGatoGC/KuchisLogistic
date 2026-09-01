import type { Request, RequestHandler } from "express";
import { AppError } from "../errors/app-error";

function hasRequestBody(req: Request) {
  if (req.headers["transfer-encoding"]) return true;
  const contentLength = req.headers["content-length"];
  if (typeof contentLength !== "string") return false;
  const length = Number(contentLength);
  return Number.isFinite(length) && length > 0;
}

export const requireJsonContentType: RequestHandler = (req, _res, next) => {
  const requiresJson = (req.method === "POST" || req.method === "PATCH") && hasRequestBody(req);
  if (requiresJson && !req.is(["application/json", "application/*+json"])) {
    next(
      new AppError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "El cuerpo de la solicitud debe usar Content-Type application/json."
      )
    );
    return;
  }
  next();
};

export const privateNoStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};
