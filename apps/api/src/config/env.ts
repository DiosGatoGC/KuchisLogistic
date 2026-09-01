import "dotenv/config";
import { z } from "zod";

const LOCAL_CORS_DEFAULTS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
] as const;

const rawEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(16),
  SUPABASE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
  READINESS_TIMEOUT_MS: z.coerce.number().int().min(250).max(10_000).default(2_000),
  JSON_BODY_LIMIT: z.string().default("100kb"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(600),
  LOGIN_IP_WINDOW_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(900_000),
  LOGIN_IP_MAX: z.coerce.number().int().min(1).max(1_000).default(30),
  LOGIN_USERNAME_WINDOW_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(900_000),
  LOGIN_USERNAME_MAX: z.coerce.number().int().min(1).max(1_000).default(10),
  TRUST_PROXY: z.enum(["false", "loopback"]).default("false"),
});

export type NodeEnvironment = "development" | "test" | "production";
export type TrustProxySetting = false | "loopback";

export interface ApiEnv {
  PORT: number;
  NODE_ENV: NodeEnvironment;
  CORS_ALLOWED_ORIGINS: readonly string[] | "*";
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_REQUEST_TIMEOUT_MS: number;
  READINESS_TIMEOUT_MS: number;
  JSON_BODY_LIMIT: string;
  JSON_BODY_LIMIT_BYTES: number;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  LOGIN_IP_WINDOW_MS: number;
  LOGIN_IP_MAX: number;
  LOGIN_USERNAME_WINDOW_MS: number;
  LOGIN_USERNAME_MAX: number;
  TRUST_PROXY: TrustProxySetting;
}

class EnvValidationError extends Error {
  constructor(public readonly variableNames: string[]) {
    super(`Invalid or missing API environment variables: ${variableNames.join(", ")}`);
    this.name = "EnvValidationError";
  }
}

function parseBodyLimit(value: string) {
  const match = value.trim().toLowerCase().match(/^(\d+)(b|kb|mb)$/);
  if (!match) throw new EnvValidationError(["JSON_BODY_LIMIT"]);

  const amount = Number(match[1]);
  const multiplier = match[2] === "mb" ? 1_048_576 : match[2] === "kb" ? 1_024 : 1;
  const bytes = amount * multiplier;
  if (!Number.isSafeInteger(bytes) || bytes < 1_024 || bytes > 1_048_576) {
    throw new EnvValidationError(["JSON_BODY_LIMIT"]);
  }

  return { label: `${amount}${match[2]}`, bytes };
}

function parseOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EnvValidationError(["CORS_ALLOWED_ORIGINS"]);
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) {
    throw new EnvValidationError(["CORS_ALLOWED_ORIGINS"]);
  }

  return url.origin;
}

function parseCorsOrigins(value: string | undefined, nodeEnv: NodeEnvironment) {
  const raw = value?.trim();
  if (!raw) {
    if (nodeEnv === "production") throw new EnvValidationError(["CORS_ALLOWED_ORIGINS"]);
    return [...LOCAL_CORS_DEFAULTS];
  }

  if (raw === "*") {
    if (nodeEnv === "production") throw new EnvValidationError(["CORS_ALLOWED_ORIGINS"]);
    return "*" as const;
  }

  const values = raw.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (values.length === 0 || values.includes("*")) {
    throw new EnvValidationError(["CORS_ALLOWED_ORIGINS"]);
  }

  return [...new Set(values.map(parseOrigin))];
}

export function parseEnv(input: Record<string, unknown>): ApiEnv {
  const parsed = rawEnvSchema.safeParse(input);
  if (!parsed.success) {
    const invalidVariables = [
      ...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "ENV"))),
    ];
    throw new EnvValidationError(invalidVariables);
  }

  const data = parsed.data;
  const supabaseUrl = new URL(data.SUPABASE_URL);
  if (
    (supabaseUrl.protocol !== "http:" && supabaseUrl.protocol !== "https:")
    || (data.NODE_ENV === "production" && supabaseUrl.protocol !== "https:")
  ) {
    throw new EnvValidationError(["SUPABASE_URL"]);
  }
  if (data.READINESS_TIMEOUT_MS >= data.SUPABASE_REQUEST_TIMEOUT_MS) {
    throw new EnvValidationError(["READINESS_TIMEOUT_MS"]);
  }

  const bodyLimit = parseBodyLimit(data.JSON_BODY_LIMIT);
  return {
    ...data,
    CORS_ALLOWED_ORIGINS: parseCorsOrigins(data.CORS_ALLOWED_ORIGINS, data.NODE_ENV),
    JSON_BODY_LIMIT: bodyLimit.label,
    JSON_BODY_LIMIT_BYTES: bodyLimit.bytes,
    TRUST_PROXY: data.TRUST_PROXY === "loopback" ? "loopback" : false,
  };
}

export const env = parseEnv(process.env);
