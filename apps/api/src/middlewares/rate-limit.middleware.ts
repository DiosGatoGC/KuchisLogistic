import { createHash } from "node:crypto";
import { rateLimit, type Options } from "express-rate-limit";
import type { ApiEnv } from "../config/env";
import type { ApiLogger } from "../logging/logger";
import { safeErrorType } from "../logging/logger";

function libraryLogger(logger: ApiLogger): Options["logger"] {
  const write = (error: unknown) => {
    logger.error({
      event: "rate_limit_configuration_warning",
      timestamp: new Date().toISOString(),
      errorType: safeErrorType(error),
    });
  };
  return { error: write, warn: write };
}

function handler(logger: ApiLogger, code: string, message: string): Options["handler"] {
  return (req, res) => {
    logger.error({
      event: "api_request_rate_limited",
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      pathname: req.path,
      status: 429,
      code,
      errorType: "RateLimitExceeded",
    });
    res.status(429).json({ error: { code, message } });
  };
}

function commonOptions(logger: ApiLogger) {
  return {
    standardHeaders: "draft-8" as const,
    legacyHeaders: false,
    passOnStoreError: false,
    skip: (req: Parameters<Options["skip"]>[0]) => req.method === "OPTIONS",
    logger: libraryLogger(logger),
  };
}

function usernameKey(req: Parameters<Options["keyGenerator"]>[0]) {
  const body = req.body as { username?: unknown } | undefined;
  const normalized = typeof body?.username === "string"
    ? body.username.trim().toLowerCase()
    : "invalid-input";
  return createHash("sha256").update(normalized || "invalid-input").digest("hex");
}

export function createRateLimiters(config: ApiEnv, logger: ApiLogger) {
  const validation = config.TRUST_PROXY === false
    ? { xForwardedForHeader: false, forwardedHeader: false }
    : true;

  const global = rateLimit({
    ...commonOptions(logger),
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
    ipv6Subnet: 56,
    identifier: "global-api",
    validate: validation,
    handler: handler(logger, "RATE_LIMITED", "Demasiadas solicitudes. Inténtalo nuevamente más tarde."),
  });

  const loginIp = rateLimit({
    ...commonOptions(logger),
    windowMs: config.LOGIN_IP_WINDOW_MS,
    limit: config.LOGIN_IP_MAX,
    ipv6Subnet: 56,
    identifier: "login-ip",
    validate: validation,
    skipSuccessfulRequests: true,
    handler: handler(logger, "AUTH_RATE_LIMITED", "Demasiados intentos. Inténtalo nuevamente más tarde."),
  });

  const loginUsername = rateLimit({
    ...commonOptions(logger),
    windowMs: config.LOGIN_USERNAME_WINDOW_MS,
    limit: config.LOGIN_USERNAME_MAX,
    identifier: "login-username",
    keyGenerator: usernameKey,
    validate: validation,
    skipSuccessfulRequests: true,
    handler: handler(logger, "AUTH_RATE_LIMITED", "Demasiados intentos. Inténtalo nuevamente más tarde."),
  });

  return { global, loginIp, loginUsername };
}
