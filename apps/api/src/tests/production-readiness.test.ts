import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, test } from "node:test";
import type { Express, Request } from "express";
import { createApp } from "../app";
import type { DeploymentContext } from "../config/deployment";
import { parseEnv, type ApiEnv } from "../config/env";
import type { ApiLogger, SafeLogRecord } from "../logging/logger";
import { clientIpRateLimitKey, resolveClientIp } from "../middlewares/client-ip";

const localDeployment: DeploymentContext = { isVercel: false };
const vercelDeployment: DeploymentContext = { isVercel: true };
const secretKey = "test-secret-key-at-least-sixteen-characters";
const silentLogger: ApiLogger = { info() {}, error() {} };

function config(overrides: Record<string, unknown> = {}): ApiEnv {
  return parseEnv({
    NODE_ENV: "test",
    PORT: 3001,
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SECRET_KEY: secretKey,
    CORS_ALLOWED_ORIGINS: "https://app.example",
    JSON_BODY_LIMIT: "100kb",
    RATE_LIMIT_WINDOW_MS: 60_000,
    RATE_LIMIT_MAX: 1_000,
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

function request({
  ip = "127.0.0.1",
  remoteAddress = "127.0.0.1",
  forwardedFor,
}: {
  ip?: string | undefined;
  remoteAddress?: string | undefined;
  forwardedFor?: string | string[];
} = {}) {
  return {
    ip,
    socket: { remoteAddress },
    headers: forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
  } as unknown as Request;
}

async function listen(app: Express) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("Production readiness client IP and local configuration", { concurrency: false }, () => {
  test("1. outside Vercel uses the existing direct Express IP", () => {
    assert.equal(resolveClientIp(request({ ip: "192.0.2.10" }), localDeployment), "192.0.2.10");
  });

  test("2. an external x-forwarded-for is not trusted outside Vercel", () => {
    const req = request({ ip: "127.0.0.1", forwardedFor: "203.0.113.10" });
    assert.equal(resolveClientIp(req, localDeployment), "127.0.0.1");
  });

  test("3. Vercel uses one validated x-forwarded-for IP", () => {
    const req = request({ ip: "127.0.0.1", forwardedFor: " 203.0.113.10 " });
    assert.equal(resolveClientIp(req, vercelDeployment), "203.0.113.10");
  });

  test("4. missing Vercel x-forwarded-for falls back safely", () => {
    const req = request({ ip: "invalid-express-ip", remoteAddress: "192.0.2.20" });
    assert.equal(resolveClientIp(req, vercelDeployment), "192.0.2.20");
  });

  test("5. a malformed Vercel header does not throw or replace the safe fallback", () => {
    const req = request({ ip: "127.0.0.1", forwardedFor: "not-an-ip" });
    assert.doesNotThrow(() => resolveClientIp(req, vercelDeployment));
    assert.equal(resolveClientIp(req, vercelDeployment), "127.0.0.1");
  });

  test("6. the resolver never returns an arbitrary raw forwarded chain", () => {
    const raw = "203.0.113.10, 198.51.100.4";
    const resolved = resolveClientIp(
      request({ ip: "127.0.0.1", forwardedFor: raw }),
      vercelDeployment
    );
    assert.equal(resolved, "127.0.0.1");
    assert.notEqual(resolved, raw);
  });

  test("7. two Vercel client IPs produce different rate-limit keys", () => {
    const first = clientIpRateLimitKey(
      request({ forwardedFor: "203.0.113.10" }),
      vercelDeployment
    );
    const second = clientIpRateLimitKey(
      request({ forwardedFor: "198.51.100.20" }),
      vercelDeployment
    );
    assert.notEqual(first, second);
  });

  test("8. the same Vercel client IP produces the same rate-limit key", () => {
    const first = clientIpRateLimitKey(
      request({ forwardedFor: "2001:db8:1234:5600::1" }),
      vercelDeployment
    );
    const second = clientIpRateLimitKey(
      request({ forwardedFor: "2001:db8:1234:5600::1" }),
      vercelDeployment
    );
    assert.equal(first, second);
  });

  test("9. the login IP limiter uses the central Vercel client identity", async () => {
    const running = await listen(createApp(config({ LOGIN_IP_MAX: 1 }), {
      deployment: vercelDeployment,
    }));
    try {
      const sendMalformed = (forwardedFor: string) => fetch(
        `${running.baseUrl}/api/logistics/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": forwardedFor,
          },
          body: "{invalid",
        }
      );
      assert.equal((await sendMalformed("203.0.113.10")).status, 400);
      assert.equal((await sendMalformed("203.0.113.10")).status, 429);
      assert.equal((await sendMalformed("198.51.100.20")).status, 400);
    } finally {
      await close(running.server);
    }
  });

  test("10. the global limiter uses the central Vercel client identity", async () => {
    const running = await listen(createApp(config({ RATE_LIMIT_MAX: 1 }), {
      deployment: vercelDeployment,
      configureRoutes(app) {
        app.get("/api/test/rate", (_req, res) => res.status(200).json({ ok: true }));
      },
    }));
    try {
      const send = (forwardedFor: string) => fetch(`${running.baseUrl}/api/test/rate`, {
        headers: { "X-Forwarded-For": forwardedFor },
      });
      assert.equal((await send("203.0.113.10")).status, 200);
      assert.equal((await send("198.51.100.20")).status, 200);
      assert.equal((await send("203.0.113.10")).status, 429);
    } finally {
      await close(running.server);
    }
  });

  test("11. the login username limiter keeps trimmed lowercase semantics", async () => {
    const running = await listen(createApp(config({ LOGIN_USERNAME_MAX: 1 }), {
      deployment: vercelDeployment,
      configureRoutes(app) {
        app.post("/api/logistics/auth/login", (_req, res) => res.status(401).json({ error: true }));
      },
    }));
    try {
      const send = (username: string) => fetch(`${running.baseUrl}/api/logistics/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.10",
        },
        body: JSON.stringify({ username, password: "wrong" }),
      });
      assert.equal((await send(" Target.User ")).status, 401);
      assert.equal((await send("target.user")).status, 429);
    } finally {
      await close(running.server);
    }
  });

  test("12. the change does not enable permissive Express trust proxy", () => {
    const direct = createApp(config({ TRUST_PROXY: "false" }), { deployment: vercelDeployment });
    const loopback = createApp(config({ TRUST_PROXY: "loopback" }), { deployment: localDeployment });
    assert.equal(direct.get("trust proxy"), false);
    assert.equal(loopback.get("trust proxy"), "loopback");
    assert.throws(() => config({ TRUST_PROXY: "true" }));
  });

  test("13. production without CORS origins fails closed", () => {
    assert.throws(
      () => productionConfig({ CORS_ALLOWED_ORIGINS: undefined }),
      /CORS_ALLOWED_ORIGINS/
    );
  });

  test("14. production rejects wildcard CORS", () => {
    assert.throws(
      () => productionConfig({ CORS_ALLOWED_ORIGINS: "*" }),
      /CORS_ALLOWED_ORIGINS/
    );
  });

  test("15. production keeps multiple exact CORS origins", async () => {
    const firstOrigin = "https://public.example";
    const secondOrigin = "https://logistics.example";
    const running = await listen(createApp(productionConfig({
      CORS_ALLOWED_ORIGINS: `${firstOrigin},${secondOrigin}`,
    }), { deployment: vercelDeployment, logger: silentLogger }));
    try {
      const first = await fetch(`${running.baseUrl}/health`, { headers: { Origin: firstOrigin } });
      const second = await fetch(`${running.baseUrl}/health`, { headers: { Origin: secondOrigin } });
      const denied = await fetch(`${running.baseUrl}/health`, {
        headers: { Origin: "https://public.example.evil" },
      });
      assert.equal(first.headers.get("access-control-allow-origin"), firstOrigin);
      assert.equal(second.headers.get("access-control-allow-origin"), secondOrigin);
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("access-control-allow-origin"), null);
    } finally {
      await close(running.server);
    }
  });

  test("16. logs contain neither secrets nor the raw forwarded header", async () => {
    const infoLogs: SafeLogRecord[] = [];
    const errorLogs: SafeLogRecord[] = [];
    const logger: ApiLogger = {
      info(record) { infoLogs.push({ ...record }); },
      error(record) { errorLogs.push({ ...record }); },
    };
    const rawForwardedFor = "203.0.113.10,raw-forwarded-secret";
    const running = await listen(createApp(config(), {
      deployment: vercelDeployment,
      logger,
      configureRoutes(app) {
        app.get("/api/test/logging", (_req, res) => res.status(200).json({ ok: true }));
      },
    }));
    try {
      const response = await fetch(`${running.baseUrl}/api/test/logging`, {
        headers: { "X-Forwarded-For": rawForwardedFor },
      });
      assert.equal(response.status, 200);
      await response.text();
      const serialized = JSON.stringify({ infoLogs, errorLogs });
      assert.equal(serialized.includes(rawForwardedFor), false);
      assert.equal(serialized.includes("raw-forwarded-secret"), false);
      assert.equal(serialized.includes(secretKey), false);
    } finally {
      await close(running.server);
    }
  });

  test("17. readiness timeout must remain below the Supabase request timeout", () => {
    assert.throws(
      () => productionConfig({
        SUPABASE_REQUEST_TIMEOUT_MS: 2_000,
        READINESS_TIMEOUT_MS: 2_000,
      }),
      /READINESS_TIMEOUT_MS/
    );
    assert.equal(productionConfig({
      SUPABASE_REQUEST_TIMEOUT_MS: 8_000,
      READINESS_TIMEOUT_MS: 2_000,
    }).READINESS_TIMEOUT_MS, 2_000);
  });
});
