import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

type LocalStatus = {
  API_URL?: string;
  DB_URL?: string;
  PUBLISHABLE_KEY?: string;
  ANON_KEY?: string;
  SECRET_KEY?: string;
  SERVICE_ROLE_KEY?: string;
};

const projectRoot = resolve(__dirname, "../../../../..");
const apiRoot = resolve(projectRoot, "apps/api");
const supabaseCli = resolve(projectRoot, "node_modules/.bin/supabase");

const suites = {
  e2e: resolve(__dirname, "e2e.test.ts"),
  concurrency: resolve(__dirname, "concurrency.test.ts"),
  realtime: resolve(__dirname, "realtime.test.ts"),
} as const;

type SuiteName = keyof typeof suites;

function isLoopback(value: string) {
  const hostname = new URL(value).hostname.replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function runCli(args: string[], capture = false) {
  const result = spawnSync(supabaseCli, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `${result.stderr}\n${result.stdout}`.trim() : "";
    throw new Error(`Supabase CLI failed (${args.join(" ")})${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout ?? "";
}

function localStatus(): Required<LocalStatus> {
  const raw = runCli(["status", "--output", "json"], true);
  let status: LocalStatus;
  try {
    status = JSON.parse(raw) as LocalStatus;
  } catch {
    throw new Error("Supabase local status did not return valid JSON.");
  }

  const publicKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!status.API_URL || !status.DB_URL || !publicKey || !secretKey) {
    throw new Error("Supabase local status is missing required API, DB, or key values.");
  }
  if (!isLoopback(status.API_URL) || !isLoopback(status.DB_URL)) {
    throw new Error("Refusing integration tests: Supabase API and DB must both be loopback URLs.");
  }
  if (new URL(status.API_URL).protocol !== "http:") {
    throw new Error("Refusing integration tests: local Supabase API must use explicit HTTP loopback.");
  }

  return {
    API_URL: status.API_URL,
    DB_URL: status.DB_URL,
    PUBLISHABLE_KEY: publicKey,
    ANON_KEY: publicKey,
    SECRET_KEY: secretKey,
    SERVICE_ROLE_KEY: secretKey,
  };
}

function resetLocal() {
  runCli(["db", "reset", "--local", "--yes"]);
}

function requestedSuites(): SuiteName[] {
  const requested = process.argv[2] ?? "e2e";
  if (requested === "all") return Object.keys(suites) as SuiteName[];
  if (requested in suites) return [requested as SuiteName];
  throw new Error(`Unknown local integration suite: ${requested}`);
}

const status = localStatus();
const childEnv = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3001",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
  SUPABASE_URL: status.API_URL,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  KUCHIS_INTEGRATION_LOCAL: "confirmed",
  KUCHIS_E2E_SUPABASE_PUBLIC_KEY: status.PUBLISHABLE_KEY,
  KUCHIS_LOCAL_DB_URL: status.DB_URL,
  KUCHIS_PROJECT_ROOT: projectRoot,
};

let exitCode = 0;
try {
  for (const suite of requestedSuites()) {
    console.log(`[integration:local] resetting before ${suite}`);
    resetLocal();
    const result = spawnSync(
      process.execPath,
      ["--test", "--test-concurrency=1", "--import", "tsx", suites[suite]],
      { cwd: apiRoot, env: childEnv, stdio: "inherit" }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  console.log("[integration:local] final local reset");
  resetLocal();
}

process.exitCode = exitCode;
