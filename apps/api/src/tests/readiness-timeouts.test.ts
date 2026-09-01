import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, mock, test } from "node:test";
import type { Express } from "express";
import { createApp } from "../app";
import { parseEnv, type ApiEnv } from "../config/env";
import {
  createSupabaseAdminClient,
  createSupabaseAuthClient,
  createSupabaseClientOptions,
  supabaseAdmin,
} from "../config/supabase";
import {
  createTimeoutFetch,
  SupabaseRequestTimeoutError,
} from "../config/supabase-fetch";
import type { ApiLogger, SafeLogRecord } from "../logging/logger";
import {
  createReadinessService,
  probeSupabaseReadiness,
  type ReadinessChecker,
} from "../readiness/readiness.service";

const secretKey = "test-secret-key-at-least-sixteen-characters";
const allowedOrigin = "https://allowed.example";
const uuid = "11111111-1111-4111-8111-111111111111";

function config(overrides: Record<string, unknown> = {}): ApiEnv {
  return parseEnv({
    NODE_ENV: "test",
    PORT: 3001,
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SECRET_KEY: secretKey,
    CORS_ALLOWED_ORIGINS: allowedOrigin,
    RATE_LIMIT_MAX: 5_000,
    LOGIN_IP_MAX: 100,
    LOGIN_USERNAME_MAX: 100,
    ...overrides,
  });
}

function asFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) {
  return implementation as typeof globalThis.fetch;
}

function fakeTimerHandle() {
  return 1 as unknown as ReturnType<typeof setTimeout>;
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

async function withApp(
  readiness: ReadinessChecker,
  run: (baseUrl: string) => Promise<void>,
  logger?: ApiLogger
) {
  const running = await listen(createApp(config(), { readiness, logger }));
  try {
    await run(running.baseUrl);
  } finally {
    await close(running.server);
  }
}

async function body(response: globalThis.Response) {
  return await response.json() as Record<string, unknown>;
}

describe("Supabase readiness and HTTP timeouts", { concurrency: false }, () => {
  afterEach(() => mock.restoreAll());

  test("1. /health remains 200 without invoking readiness or Supabase", async () => {
    let checks = 0;
    await withApp({ check: async () => { checks += 1; throw new Error("must not run"); } }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
      assert.equal((await body(response)).status, "ok");
      assert.equal(checks, 0);
    });
  });

  test("2. /health/ready uses a minimal profiles probe and returns ready", async () => {
    const observed: Record<string, unknown> = {};
    const builder: Record<string, any> = {};
    builder.select = (columns: string) => { observed.columns = columns; return builder; };
    builder.limit = (limit: number) => { observed.limit = limit; return builder; };
    builder.abortSignal = async (signal: AbortSignal) => {
      observed.signal = signal;
      return { data: [], error: null };
    };
    mock.method(supabaseAdmin, "from", (table: string) => {
      observed.table = table;
      return builder as never;
    });
    const readiness = createReadinessService({ probe: probeSupabaseReadiness, timeoutMs: 250 });

    await withApp(readiness, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health/ready`);
      assert.equal(response.status, 200);
      assert.deepEqual(await body(response), { status: "ready" });
    });
    assert.equal(observed.table, "profiles");
    assert.equal(observed.columns, "id");
    assert.equal(observed.limit, 1);
    assert.equal(observed.signal instanceof AbortSignal, true);
  });

  test("3. dependency failure returns 503 not_ready", async () => {
    await withApp({ check: async () => false }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health/ready`);
      assert.equal(response.status, 503);
      assert.deepEqual(await body(response), { status: "not_ready" });
    });
  });

  test("4. readiness timeout aborts its probe and returns 503", async () => {
    let fireTimeout: (() => void) | undefined;
    let probeStarted!: () => void;
    const started = new Promise<void>((resolve) => { probeStarted = resolve; });
    const readiness = createReadinessService({
      timeoutMs: 250,
      probe: (signal) => new Promise<void>((_resolve, reject) => {
        probeStarted();
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      runtime: {
        setTimeout(callback) { fireTimeout = callback; return fakeTimerHandle(); },
        clearTimeout() {},
      },
    });

    await withApp(readiness, async (baseUrl) => {
      const pending = fetch(`${baseUrl}/health/ready`);
      await started;
      fireTimeout?.();
      const response = await pending;
      assert.equal(response.status, 503);
      assert.deepEqual(await body(response), { status: "not_ready" });
    });
  });

  test("5. readiness never exposes an upstream error", async () => {
    const upstream = "postgres://private-host/raw-sql?service_key=secret";
    await withApp({ check: async () => { throw new Error(upstream); } }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health/ready`);
      const serialized = JSON.stringify(await body(response));
      assert.equal(response.status, 503);
      assert.equal(serialized.includes(upstream), false);
      assert.equal(serialized.includes("postgres"), false);
      assert.equal(serialized.includes("service_key"), false);
    });
  });

  test("6. readiness responses always use Cache-Control no-store", async () => {
    for (const ready of [true, false]) {
      await withApp({ check: async () => ready }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/health/ready`);
        assert.equal(response.headers.get("cache-control"), "no-store");
      });
    }
  });

  test("7. readiness keeps the server-generated X-Request-ID", async () => {
    await withApp({ check: async () => true }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health/ready`, {
        headers: { "X-Request-ID": "client-controlled" },
      });
      const requestId = response.headers.get("x-request-id") ?? "";
      assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
      assert.notEqual(requestId, "client-controlled");
    });
  });

  test("8. concurrent readiness requests coalesce into one probe", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const readiness = createReadinessService({
      timeoutMs: 2_000,
      probe: async () => { calls += 1; await gate; },
    });
    const checks = Array.from({ length: 20 }, () => readiness.check());
    await Promise.resolve();
    assert.equal(calls, 1);
    release();
    assert.deepEqual(await Promise.all(checks), Array(20).fill(true));
  });

  test("9. ready and not_ready results are cached during the TTL", async () => {
    for (const succeeds of [true, false]) {
      let calls = 0;
      const readiness = createReadinessService({
        timeoutMs: 2_000,
        probe: async () => { calls += 1; if (!succeeds) throw new Error("down"); },
      });
      assert.equal(await readiness.check(), succeeds);
      assert.equal(await readiness.check(), succeeds);
      assert.equal(calls, 1);
    }
  });

  test("10. readiness cache expires and triggers a new probe", async () => {
    let clock = 10_000;
    let calls = 0;
    const readiness = createReadinessService({
      timeoutMs: 2_000,
      ttlMs: 3_000,
      probe: async () => { calls += 1; },
      runtime: { now: () => clock },
    });
    assert.equal(await readiness.check(), true);
    clock = 12_999;
    assert.equal(await readiness.check(), true);
    assert.equal(calls, 1);
    clock = 13_000;
    assert.equal(await readiness.check(), true);
    assert.equal(calls, 2);
  });

  test("11. the common fetch timeout aborts the real upstream operation", async () => {
    let fireTimeout: (() => void) | undefined;
    let upstreamAborted = false;
    let start!: () => void;
    const started = new Promise<void>((resolve) => { start = resolve; });
    const fetchImpl = asFetch((_input, init) => new Promise<Response>((_resolve, reject) => {
      start();
      init?.signal?.addEventListener("abort", () => {
        upstreamAborted = true;
        reject(init.signal?.reason);
      }, { once: true });
    }));
    const timedFetch = createTimeoutFetch(8_000, {
      fetch: fetchImpl,
      setTimeout(callback) { fireTimeout = callback; return fakeTimerHandle(); },
      clearTimeout() {},
    });
    const pending = timedFetch(new URL("https://upstream.example/rest/v1/profiles"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await started;
    fireTimeout?.();
    await assert.rejects(pending, (error) => error instanceof SupabaseRequestTimeoutError);
    assert.equal(upstreamAborted, true);
  });

  test("12. a caller AbortSignal also aborts the upstream request", async () => {
    const caller = new AbortController();
    let upstreamAborted = false;
    let start!: () => void;
    const started = new Promise<void>((resolve) => { start = resolve; });
    const fetchImpl = asFetch((input, init) => new Promise<Response>((_resolve, reject) => {
      assert.equal(input instanceof Request, true);
      start();
      init?.signal?.addEventListener("abort", () => {
        upstreamAborted = true;
        reject(init.signal?.reason);
      }, { once: true });
    }));
    const timedFetch = createTimeoutFetch(8_000, {
      fetch: fetchImpl,
      setTimeout() { return fakeTimerHandle(); },
      clearTimeout() {},
    });
    const reason = new DOMException("caller stopped", "AbortError");
    const request = new Request("https://upstream.example/auth/v1/user", {
      method: "GET",
      signal: caller.signal,
    });
    const pending = timedFetch(request);
    await started;
    caller.abort(reason);
    await assert.rejects(pending, (error) => error === reason);
    assert.equal(upstreamAborted, true);
  });

  test("13. timeout fetch clears timers and removes caller listeners", async () => {
    const caller = new AbortController();
    const signal = caller.signal;
    const originalAdd = signal.addEventListener.bind(signal);
    const originalRemove = signal.removeEventListener.bind(signal);
    let added = 0;
    let removed = 0;
    let cleared = 0;
    signal.addEventListener = ((...args: Parameters<AbortSignal["addEventListener"]>) => {
      added += 1;
      return originalAdd(...args);
    }) as AbortSignal["addEventListener"];
    signal.removeEventListener = ((...args: Parameters<AbortSignal["removeEventListener"]>) => {
      removed += 1;
      return originalRemove(...args);
    }) as AbortSignal["removeEventListener"];

    const timedFetch = createTimeoutFetch(8_000, {
      fetch: asFetch(async () => new Response("ok")),
      setTimeout() { return fakeTimerHandle(); },
      clearTimeout() { cleared += 1; },
    });
    await timedFetch("https://upstream.example/rest/v1/profiles", { signal });
    assert.equal(added, 1);
    assert.equal(removed, 1);
    assert.equal(cleared, 1);
  });

  test("14. Auth uses the common custom fetch", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const customFetch = asFetch(async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      return new Response(JSON.stringify({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "bearer",
        expires_in: 3_600,
        user: { id: uuid, aud: "authenticated", role: "authenticated", email: "user@example.test" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createSupabaseAuthClient(config(), customFetch);
    const result = await client.auth.signInWithPassword({ email: "user@example.test", password: "password" });
    assert.equal(result.error, null);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/auth\/v1\/token\?grant_type=password/);
    assert.equal(calls[0]!.method, "POST");
  });

  test("15. PostgREST reads and RPC use the same custom fetch", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const customFetch = asFetch(async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createSupabaseAdminClient(config(), customFetch);
    await client.from("profiles").select("id").limit(1);
    await client.rpc("logistics_checkout_preview", { p_service_session_id: uuid });
    assert.equal(calls.length, 2);
    assert.match(calls[0]!.url, /\/rest\/v1\/profiles\?select=id/);
    assert.equal(calls[0]!.method, "GET");
    assert.match(calls[1]!.url, /\/rest\/v1\/rpc\/logistics_checkout_preview/);
    assert.equal(calls[1]!.method, "POST");
  });

  test("16. readiness timeout and failure share one sanitized public contract", async () => {
    for (const readiness of [
      { check: async () => false },
      { check: async () => { throw new SupabaseRequestTimeoutError(); } },
    ]) {
      await withApp(readiness, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/health/ready`);
        assert.equal(response.status, 503);
        assert.deepEqual(await body(response), { status: "not_ready" });
      });
    }
  });

  test("17. upstream secrets never appear in readiness logs", async () => {
    const info: SafeLogRecord[] = [];
    const errors: SafeLogRecord[] = [];
    const logger: ApiLogger = {
      info(record) { info.push({ ...record }); },
      error(record) { errors.push({ ...record }); },
    };
    const secret = "SUPABASE_SECRET_KEY=never-log-this";
    await withApp({ check: async () => { throw new Error(secret); } }, async (baseUrl) => {
      await fetch(`${baseUrl}/health/ready?authorization=Bearer-secret`);
    }, logger);
    const serialized = JSON.stringify({ info, errors });
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes("Bearer-secret"), false);
    assert.equal(serialized.includes("authorization="), false);
  });

  test("18. liveness stays healthy after an upstream readiness failure", async () => {
    await withApp({ check: async () => false }, async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 503);
      assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    });
  });

  test("19. the timeout wrapper introduces no automatic retry for writes", async () => {
    let calls = 0;
    const timedFetch = createTimeoutFetch(8_000, {
      fetch: asFetch(async () => { calls += 1; throw new TypeError("network unavailable"); }),
    });
    await assert.rejects(
      timedFetch("https://upstream.example/rest/v1/rpc/write_operation", {
        method: "POST",
        body: "{}",
      }),
      TypeError
    );
    assert.equal(calls, 1);
  });

  test("20. timeout env is bounded and Realtime WebSocket transport is not wrapped", () => {
    const parsed = config({ SUPABASE_REQUEST_TIMEOUT_MS: undefined, READINESS_TIMEOUT_MS: undefined });
    assert.equal(parsed.SUPABASE_REQUEST_TIMEOUT_MS, 8_000);
    assert.equal(parsed.READINESS_TIMEOUT_MS, 2_000);
    for (const overrides of [
      { SUPABASE_REQUEST_TIMEOUT_MS: 999 },
      { SUPABASE_REQUEST_TIMEOUT_MS: 30_001 },
      { READINESS_TIMEOUT_MS: 249 },
      { READINESS_TIMEOUT_MS: 10_001 },
    ]) {
      assert.throws(() => config(overrides));
    }
    const customFetch = asFetch(async () => new Response("[]"));
    const options = createSupabaseClientOptions(customFetch);
    assert.equal(options.global.fetch, customFetch);
    assert.equal("realtime" in options, false);
  });
});
