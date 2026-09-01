import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { ApiLogger } from "../logging/logger";

export function createRequestContextMiddleware(logger: ApiLogger): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    req.requestId = randomUUID();
    res.setHeader("X-Request-ID", req.requestId);

    res.once("finish", () => {
      const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info({
        event: "api_request_completed",
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        method: req.method,
        pathname: req.path,
        status: res.statusCode,
        durationMs: Math.round(elapsed * 1_000) / 1_000,
      });
    });

    next();
  };
}
