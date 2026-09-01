import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, mock, test } from "node:test";
import type { Express } from "express";
import { createApp } from "../app";
import { parseEnv, type ApiEnv } from "../config/env";
import { supabaseAdmin } from "../config/supabase";
import { mapRpcError } from "../database/rpc-errors";
import { AppError, unauthorized } from "../errors/app-error";
import type { ApiLogger, SafeLogRecord } from "../logging/logger";
import { authService } from "../modules/auth/auth.service";

const secretKey = "test-secret-key-at-least-sixteen-characters";
const allowedOrigin = "https://allowed.example";

function config(overrides: Record<string, unknown> = {}): ApiEnv {
  return parseEnv({
    NODE_ENV: "test",
    PORT: 3001,
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SECRET_KEY: secretKey,
    CORS_ALLOWED_ORIGINS: allowedOrigin,
    JSON_BODY_LIMIT: "1kb",
    RATE_LIMIT_WINDOW_MS: 60_000,
    RATE_LIMIT_MAX: 5_000,
    LOGIN_IP_WINDOW_MS: 60_000,
    LOGIN_IP_MAX: 100,
    LOGIN_USERNAME_WINDOW_MS: 60_000,
    LOGIN_USERNAME_MAX: 100,
    TRUST_PROXY: "false",
    ...overrides,
  });
}

function productionConfig(overrides: Record<string, unknown> = {}) {
  return config({
    NODE_ENV: "production",
    SUPABASE_URL: "https://project.supabase.co",
    CORS_ALLOWED_ORIGINS: "https://app.example",
    ...overrides,
  });
}

async function listen(app: Express) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function json(response: globalThis.Response) {
  return (await response.json()) as Record<string, any>;
}

function sensitiveKeys(value: unknown, path: string[] = []): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => sensitiveKeys(entry, [...path, String(index)]));
  const forbidden = new Set([
    "password",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "auth_email",
    "service_role",
    "secret",
    "supabase_secret_key",
  ]);
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const current = [...path, key];
    return [
      ...(forbidden.has(key.toLowerCase()) ? [current.join(".")] : []),
      ...sensitiveKeys(entry, current),
    ];
  });
}

describe("HTTP and security hardening", { concurrency: false }, () => {
  const infoLogs: SafeLogRecord[] = [];
  const errorLogs: SafeLogRecord[] = [];
  const logger: ApiLogger = {
    info(record) { infoLogs.push({ ...record }); },
    error(record) { errorLogs.push({ ...record }); },
  };

  let server: Server;
  let baseUrl: string;

  before(async () => {
    const running = await listen(createApp(config(), {
      logger,
      configureRoutes(app) {
        app.post("/api/test/echo", (req, res) => res.status(200).json({ body: req.body ?? null }));
        app.post("/api/test/no-body", (_req, res) => res.status(204).end());
        app.get("/api/test/ip", (req, res) => res.status(200).json({ ip: req.ip }));
        app.get("/api/public-test", (_req, res) => res.status(200).json({ public: true }));
        app.get("/api/logistics/test/private", (_req, res) => res.status(200).json({ private: true }));
        app.get("/api/logistics/test/unknown-error", () => {
          const error = new Error("password=unknown-error-secret");
          error.cause = { message: "postgres://secret@internal", code: "XX999" };
          throw error;
        });
        app.get("/api/logistics/test/app-error", (_req, _res, next) => {
          next(new AppError(
            500,
            "SAFE_TEST_ERROR",
            "Mensaje público seguro.",
            { password: "never-return-this" },
            { cause: new Error("supabase-secret-key-value") }
          ));
        });
      },
    }));
    server = running.server;
    baseUrl = running.baseUrl;
  });

  afterEach(() => {
    mock.restoreAll();
    infoLogs.length = 0;
    errorLogs.length = 0;
  });

  after(async () => close(server));

  test("1. production CORS is required, validates origins, deduplicates, and rejects wildcard", () => {
    for (const invalid of [undefined, "*", "https://app.example/path", "https://app.example?x=1", "https://app.example#x"] as const) {
      assert.throws(
        () => productionConfig({ CORS_ALLOWED_ORIGINS: invalid }),
        (error: Error) => error.message === "Invalid or missing API environment variables: CORS_ALLOWED_ORIGINS"
      );
    }
    const parsed = productionConfig({
      CORS_ALLOWED_ORIGINS: " https://app.example,https://app.example/,https://admin.example ",
    });
    assert.deepEqual(parsed.CORS_ALLOWED_ORIGINS, ["https://app.example", "https://admin.example"]);
    assert.deepEqual(config({ CORS_ALLOWED_ORIGINS: undefined }).CORS_ALLOWED_ORIGINS, [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3002",
      "http://127.0.0.1:3002",
    ]);
  });

  test("2. env validation rejects unsafe values without printing secret contents", () => {
    const exposedSecret = "short-secret-value";
    assert.throws(
      () => productionConfig({ SUPABASE_SECRET_KEY: exposedSecret.slice(0, 5) }),
      (error: Error) => error.message.includes("SUPABASE_SECRET_KEY") && !error.message.includes(exposedSecret)
    );
    for (const overrides of [
      { SUPABASE_URL: "http://remote.example" },
      { JSON_BODY_LIMIT: "20mb" },
      { RATE_LIMIT_MAX: 0 },
      { TRUST_PROXY: "true" },
    ]) {
      assert.throws(() => productionConfig(overrides));
    }
  });

  test("3. development/test security headers are present without HSTS", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("strict-transport-security"), null);
    assert.equal(response.headers.get("content-security-policy"), null);
  });

  test("4. production enables HSTS without requiring a deployment", async () => {
    const running = await listen(createApp(productionConfig(), { logger }));
    try {
      const response = await fetch(`${running.baseUrl}/health`);
      assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/i);
      assert.equal(response.headers.get("x-powered-by"), null);
    } finally {
      await close(running.server);
    }
  });

  test("5. CORS allows configured origins, denies others, and permits requests without Origin", async () => {
    const allowed = await fetch(`${baseUrl}/health`, { headers: { Origin: allowedOrigin } });
    const denied = await fetch(`${baseUrl}/health`, { headers: { Origin: "https://evil.example" } });
    const direct = await fetch(`${baseUrl}/health`);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal(direct.status, 200);
  });

  test("6. OPTIONS and PATCH preflight use the real HTTP allowlist", async () => {
    const response = await fetch(
      `${baseUrl}/api/logistics/catalog/products/11111111-1111-4111-8111-111111111111/availability`,
      {
        method: "OPTIONS",
        headers: {
          Origin: allowedOrigin,
          "Access-Control-Request-Method": "PATCH",
          "Access-Control-Request-Headers": "authorization,content-type",
        },
      }
    );
    assert.equal(response.status, 204);
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /PATCH/);
    assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
  });

  test("7. JSON and application/*+json pass; POST without a body is not blocked", async () => {
    const jsonResponse = await fetch(`${baseUrl}/api/test/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    const compatible = await fetch(`${baseUrl}/api/test/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/problem+json" },
      body: JSON.stringify({ ok: true }),
    });
    const noBody = await fetch(`${baseUrl}/api/test/no-body`, { method: "POST" });
    assert.equal(jsonResponse.status, 200);
    assert.equal(compatible.status, 200);
    assert.equal(noBody.status, 204);
  });

  test("8. a body with the wrong media type returns sanitized HTTP 415", async () => {
    const response = await fetch(`${baseUrl}/api/test/echo`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{\"ok\":true}",
    });
    assert.equal(response.status, 415);
    assert.deepEqual(await json(response), {
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "El cuerpo de la solicitud debe usar Content-Type application/json.",
      },
    });
  });

  test("9. an oversized real HTTP JSON body returns sanitized HTTP 413", async () => {
    const response = await fetch(`${baseUrl}/api/test/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(2_000) }),
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await json(response), {
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "El cuerpo de la solicitud es demasiado grande.",
      },
    });
  });

  test("10. malformed JSON returns sanitized HTTP 400", async () => {
    const response = await fetch(`${baseUrl}/api/test/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await json(response), {
      error: { code: "INVALID_JSON", message: "El cuerpo JSON no es válido." },
    });
  });

  test("11. request IDs are server-generated, valid, unique, and ignore client input", async () => {
    const first = await fetch(`${baseUrl}/health`, { headers: { "X-Request-ID": "malicious-input" } });
    const second = await fetch(`${baseUrl}/health`);
    const firstId = first.headers.get("x-request-id") ?? "";
    const secondId = second.headers.get("x-request-id") ?? "";
    assert.match(firstId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.match(secondId, /^[0-9a-f-]{36}$/i);
    assert.notEqual(firstId, "malicious-input");
    assert.notEqual(firstId, secondId);
  });

  test("12. structured request/error logs contain required fields and no sensitive values", async () => {
    const password = "logging-password-secret";
    const bearer = "logging-bearer-secret";
    const checkoutToken = "logging-checkout-secret";
    await fetch(
      `${baseUrl}/api/unknown-log-path?password=${password}&checkoutToken=${checkoutToken}`,
      { headers: { Authorization: `Bearer ${bearer}`, Cookie: "session=cookie-secret" } }
    );
    const serialized = JSON.stringify({ infoLogs, errorLogs });
    for (const value of [password, bearer, checkoutToken, "cookie-secret", "unknown-log-path?password"] as const) {
      assert.equal(serialized.includes(value), false);
    }
    const completed = infoLogs.find((record) => record.event === "api_request_completed");
    const failed = errorLogs.find((record) => record.event === "api_request_failed");
    assert.equal(typeof completed?.timestamp, "string");
    assert.equal(typeof completed?.requestId, "string");
    assert.equal(completed?.pathname, "/api/unknown-log-path");
    assert.equal(completed?.status, 404);
    assert.equal(typeof completed?.durationMs, "number");
    assert.equal(failed?.code, "ROUTE_NOT_FOUND");
  });

  test("13. AppError and unknown errors never expose stack, cause, SQL, paths, or secret details", async () => {
    const known = await fetch(`${baseUrl}/api/logistics/test/app-error`);
    const unknown = await fetch(`${baseUrl}/api/logistics/test/unknown-error`);
    assert.equal(known.status, 500);
    assert.deepEqual(await json(known), {
      error: { code: "SAFE_TEST_ERROR", message: "Mensaje público seguro." },
    });
    assert.equal(unknown.status, 500);
    const unknownBody = await json(unknown);
    assert.deepEqual(unknownBody, {
      error: { code: "INTERNAL_SERVER_ERROR", message: "Ocurrió un error interno." },
    });
    const serialized = JSON.stringify(unknownBody);
    for (const forbidden of ["stack", "cause", "XX999", "postgres://", "password", "/home/"] as const) {
      assert.equal(serialized.includes(forbidden), false);
    }
    assert.deepEqual(sensitiveKeys(unknownBody), []);
  });

  test("14. an unknown API route returns stable sanitized JSON 404", async () => {
    const response = await fetch(`${baseUrl}/api/not-a-route`);
    assert.equal(response.status, 404);
    assert.deepEqual(await json(response), {
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "No existe una ruta GET para este recurso.",
      },
    });
  });

  test("15. private/auth responses are no-store while the public catalog policy stays separate", async () => {
    const privateResponse = await fetch(`${baseUrl}/api/logistics/test/private`);
    const authResponse = await fetch(`${baseUrl}/api/logistics/auth/me`);
    const builder: Record<string, any> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.order = async () => ({ data: [], error: null });
    mock.method(supabaseAdmin, "from", () => builder);
    const publicCatalog = await fetch(`${baseUrl}/api/categories`);
    assert.equal(privateResponse.headers.get("cache-control"), "no-store");
    assert.equal(authResponse.headers.get("cache-control"), "no-store");
    assert.equal(publicCatalog.status, 200);
    assert.equal(publicCatalog.headers.get("cache-control"), null);
  });

  test("16. the global API limiter returns stable 429 and standard headers", async () => {
    const running = await listen(createApp(config({ RATE_LIMIT_MAX: 2 }), { logger }));
    try {
      const first = await fetch(`${running.baseUrl}/api/not-found`);
      const second = await fetch(`${running.baseUrl}/api/not-found`);
      const limited = await fetch(`${running.baseUrl}/api/not-found`);
      assert.equal(first.status, 404);
      assert.equal(second.status, 404);
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.has("ratelimit"), true);
      assert.equal(limited.headers.has("ratelimit-policy"), true);
      assert.equal(limited.headers.has("retry-after"), true);
      assert.equal((await json(limited)).error.code, "RATE_LIMITED");
    } finally {
      await close(running.server);
    }
  });

  test("17. health and OPTIONS are not consumed by the global API limiter", async () => {
    const running = await listen(createApp(config({ RATE_LIMIT_MAX: 1 }), { logger }));
    try {
      for (let index = 0; index < 3; index += 1) {
        assert.equal((await fetch(`${running.baseUrl}/health`)).status, 200);
        assert.equal((await fetch(`${running.baseUrl}/api/anything`, {
          method: "OPTIONS",
          headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "POST" },
        })).status, 204);
      }
    } finally {
      await close(running.server);
    }
  });

  test("18. malformed JSON is counted by early global and login IP limiters", async () => {
    const globalRunning = await listen(createApp(config({ RATE_LIMIT_MAX: 2 }), { logger }));
    try {
      const responses = [];
      for (let index = 0; index < 3; index += 1) {
        responses.push(await fetch(`${globalRunning.baseUrl}/api/logistics/test/private`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: allowedOrigin },
          body: "{not-json",
        }));
      }
      assert.deepEqual(responses.map((response) => response.status), [400, 400, 429]);
      assert.equal((await json(responses[2]!)).error.code, "RATE_LIMITED");
      assert.equal(responses[2]!.headers.get("access-control-allow-origin"), allowedOrigin);
      assert.equal(responses[2]!.headers.get("cache-control"), "no-store");
    } finally {
      await close(globalRunning.server);
    }

    const loginRunning = await listen(createApp(config({ LOGIN_IP_MAX: 2 }), { logger }));
    try {
      const responses = [];
      for (let index = 0; index < 3; index += 1) {
        responses.push(await fetch(`${loginRunning.baseUrl}/api/logistics/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: allowedOrigin },
          body: "{not-json",
        }));
      }
      assert.deepEqual(responses.map((response) => response.status), [400, 400, 429]);
      assert.equal((await json(responses[2]!)).error.code, "AUTH_RATE_LIMITED");
      assert.equal(responses[2]!.headers.get("access-control-allow-origin"), allowedOrigin);
      assert.equal(responses[2]!.headers.get("cache-control"), "no-store");
    } finally {
      await close(loginRunning.server);
    }
  });

  test("19. login has an independent per-IP brute-force limiter", async () => {
    mock.method(authService, "login", async () => {
      throw unauthorized("INVALID_CREDENTIALS", "Usuario o contraseña incorrectos.");
    });
    const running = await listen(createApp(config({ LOGIN_IP_MAX: 2 }), { logger }));
    try {
      const statuses = [];
      for (let index = 0; index < 3; index += 1) {
        statuses.push((await fetch(`${running.baseUrl}/api/logistics/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: `user-${index}`, password: "wrong" }),
        })).status);
      }
      assert.deepEqual(statuses, [401, 401, 429]);
    } finally {
      await close(running.server);
    }
  });

  test("20. login username limiting uses a trimmed lowercase independent key", async () => {
    mock.method(authService, "login", async () => {
      throw unauthorized("INVALID_CREDENTIALS", "Usuario o contraseña incorrectos.");
    });
    const running = await listen(createApp(config({ LOGIN_USERNAME_MAX: 2 }), { logger }));
    try {
      const usernames = [" Target.User ", "target.user", "TARGET.USER"];
      const statuses = [];
      for (const username of usernames) {
        statuses.push((await fetch(`${running.baseUrl}/api/logistics/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: "wrong" }),
        })).status);
      }
      assert.deepEqual(statuses, [401, 401, 429]);
    } finally {
      await close(running.server);
    }
  });

  test("21. missing/invalid login usernames share one safe limiter key", async () => {
    const running = await listen(createApp(config({ LOGIN_USERNAME_MAX: 1 }), { logger }));
    try {
      const first = await fetch(`${running.baseUrl}/api/logistics/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong" }),
      });
      const second = await fetch(`${running.baseUrl}/api/logistics/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "different" }),
      });
      assert.equal(first.status, 400);
      assert.equal(second.status, 429);
      assert.equal((await json(second)).error.code, "AUTH_RATE_LIMITED");
    } finally {
      await close(running.server);
    }
  });

  test("22. trust proxy disabled keeps direct req.ip and ignores spoofed X-Forwarded-For", async () => {
    const running = await listen(createApp(config({ RATE_LIMIT_MAX: 1 }), {
      logger,
      configureRoutes(app) {
        app.get("/api/test/ip", (req, res) => res.status(200).json({ ip: req.ip }));
      },
    }));
    try {
      const first = await fetch(`${running.baseUrl}/api/test/ip`, {
        headers: { "X-Forwarded-For": "203.0.113.10" },
      });
      const firstBody = await json(first);
      const second = await fetch(`${running.baseUrl}/api/test/ip`, {
        headers: { "X-Forwarded-For": "198.51.100.20" },
      });
      assert.equal(first.status, 200);
      assert.equal(["127.0.0.1", "::ffff:127.0.0.1"].includes(firstBody.ip), true);
      assert.notEqual(firstBody.ip, "203.0.113.10");
      assert.equal(second.status, 429);
    } finally {
      await close(running.server);
    }
  });

  test("23. invalid login responses preserve anti-enumeration and contain no credential keys", async () => {
    mock.method(authService, "login", async () => {
      throw unauthorized("INVALID_CREDENTIALS", "Usuario o contraseña incorrectos.");
    });
    const bodies = [];
    for (const username of ["known.user", "missing.user"]) {
      const response = await fetch(`${baseUrl}/api/logistics/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "auth-response-secret" }),
      });
      assert.equal(response.status, 401);
      bodies.push(await json(response));
    }
    assert.deepEqual(bodies[0], bodies[1]);
    assert.deepEqual(sensitiveKeys(bodies), []);
    assert.equal(JSON.stringify(bodies).includes("auth-response-secret"), false);
  });

  test("24. known P0001 mappings preserve 400, 403, 404, 409, and CHECKOUT_CHANGED", () => {
    const cases: Array<[string, number]> = [
      ["PAYMENT_METHOD_REQUIRED", 400],
      ["ACTOR_INVALID", 403],
      ["SERVICE_SESSION_NOT_FOUND", 404],
      ["SHIFT_NOT_OPEN", 409],
      ["PAYMENT_ALREADY_EXISTS", 409],
      ["CHECKOUT_CHANGED", 409],
    ];
    for (const [code, status] of cases) {
      const error = mapRpcError({ code: "P0001", message: code }, "OPERATION_FAILED");
      assert.equal(error.code, code);
      assert.equal(error.statusCode, status);
    }
    const trimmed = mapRpcError({ code: "P0001", message: "  CHECKOUT_CHANGED \n" }, "OPERATION_FAILED");
    assert.equal(trimmed.code, "CHECKOUT_CHANGED");
    assert.equal(trimmed.statusCode, 409);
  });

  test("25. unknown, malformed, non-exact, and non-P0001 database errors become sanitized 500", () => {
    for (const external of [
      { code: "P0001", message: "UNEXPECTED_DATABASE_FAILURE" },
      { code: "P0001", message: "database failed" },
      { code: "P0001", message: "CHECKOUT_CHANGED unexpected internal detail" },
      { code: "P0001", message: "unexpected PAYMENT_ALREADY_EXISTS" },
      { code: "23505", message: "ACTOR_INVALID" },
    ]) {
      const error = mapRpcError(external, "OPERATION_FAILED");
      assert.equal(error.statusCode, 500);
      assert.equal(error.code, "OPERATION_FAILED");
      assert.equal(error.message, "No se pudo completar la operación logística.");
      assert.equal(error.message.includes(String(external.message)), false);
    }
  });
});
