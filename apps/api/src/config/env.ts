import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  CORS_ALLOWED_ORIGINS: z.string().default("*"),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const invalidVariables = [
    ...new Set(parsedEnv.error.issues.map((issue) => String(issue.path[0]))),
  ].join(", ");

  throw new Error(
    `Invalid or missing API environment variables: ${invalidVariables}`
  );
}

export const env = {
  ...parsedEnv.data,
  CORS_ALLOWED_ORIGINS:
    parsedEnv.data.CORS_ALLOWED_ORIGINS === "*"
      ? ("*" as const)
      : parsedEnv.data.CORS_ALLOWED_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
};
