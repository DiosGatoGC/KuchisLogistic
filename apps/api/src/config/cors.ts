import type { CorsOptions } from "cors";
import { AppError } from "../errors/app-error";
import { env } from "./env";

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    const isAllowed =
      !origin ||
      env.CORS_ALLOWED_ORIGINS === "*" ||
      env.CORS_ALLOWED_ORIGINS.includes(origin);

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
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  maxAge: 86_400,
};
