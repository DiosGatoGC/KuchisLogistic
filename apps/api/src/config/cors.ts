import type { CorsOptions } from "cors";
import { AppError } from "../errors/app-error";
import type { ApiEnv } from "./env";

export const CORS_METHODS = ["GET", "HEAD", "POST", "PATCH", "OPTIONS"] as const;

export function createCorsOptions(config: ApiEnv): CorsOptions {
  return {
    origin(origin, callback) {
      const isAllowed =
        !origin
        || config.CORS_ALLOWED_ORIGINS === "*"
        || config.CORS_ALLOWED_ORIGINS.includes(origin);

      if (isAllowed) {
        callback(null, true);
        return;
      }

      callback(
        new AppError(
          403,
          "CORS_ORIGIN_FORBIDDEN",
          "El origen de la solicitud no está permitido."
        )
      );
    },
    methods: [...CORS_METHODS],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["X-Request-ID", "RateLimit", "RateLimit-Policy", "Retry-After"],
    credentials: false,
    maxAge: 86_400,
  };
}
