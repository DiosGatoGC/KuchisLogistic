import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { once } from "node:events";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@kuchis/shared/database-types";
import app from "../../app";

export type ApiBody = Record<string, any>;
export type ApiResult<T = ApiBody> = { status: number; body: T };

export const LOCAL_ADMIN_PASSWORD = "Objective13-Local-Only!";

function loopbackUrl(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} is required for local integration tests.`);
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    throw new Error(`Refusing integration tests: ${name} is not loopback.`);
  }
  return value;
}

export function assertLocalEnvironment() {
  if (process.env.KUCHIS_INTEGRATION_LOCAL !== "confirmed") {
    throw new Error("Refusing integration tests without KUCHIS_INTEGRATION_LOCAL=confirmed.");
  }
  const apiUrl = loopbackUrl("SUPABASE_URL", process.env.SUPABASE_URL);
  const dbUrl = loopbackUrl("KUCHIS_LOCAL_DB_URL", process.env.KUCHIS_LOCAL_DB_URL);
  if (new URL(apiUrl).protocol !== "http:") {
    throw new Error("Refusing integration tests: local Supabase API must use HTTP.");
  }
  const publicKey = process.env.KUCHIS_E2E_SUPABASE_PUBLIC_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new Error("Local publishable and secret keys are required.");
  }
  return { apiUrl, dbUrl, publicKey, secretKey };
}

export function adminClient() {
  const local = assertLocalEnvironment();
  return createClient<Database>(local.apiUrl, local.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function publicClient() {
  const local = assertLocalEnvironment();
  return createClient<Database>(local.apiUrl, local.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function bootstrapProfile(
  client: SupabaseClient<Database>,
  options: { role?: Database["public"]["Enums"]["user_role"]; active?: boolean; label?: string } = {}
) {
  const label = options.label ?? randomUUID().slice(0, 8);
  const username = `e2e.${label}`.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const authEmail = `${username}@local.kuchis.invalid`;
  const { data, error } = await client.auth.admin.createUser({
    email: authEmail,
    password: LOCAL_ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Local Auth bootstrap failed: ${error?.message ?? "missing user"}`);
  const { error: profileError } = await client.from("profiles").insert({
    id: data.user.id,
    username,
    auth_email: authEmail,
    full_name: `Integration ${label}`,
    role: options.role ?? "ADMIN",
    is_active: options.active ?? true,
  });
  if (profileError) throw new Error(`Local profile bootstrap failed: ${profileError.message}`);
  return { id: data.user.id, username, authEmail, password: LOCAL_ADMIN_PASSWORD };
}

export async function startApi() {
  assertLocalEnvironment();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      if (!server.listening) return;
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    },
  };
}

export async function request<T = ApiBody>(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = (await response.json()) as T;
  return { status: response.status, body };
}

export async function login(baseUrl: string, username: string, password = LOCAL_ADMIN_PASSWORD) {
  const result = await request(baseUrl, "/api/logistics/auth/login", {
    method: "POST",
    body: { username, password },
  });
  if (result.status !== 200 || typeof result.body.session?.accessToken !== "string") {
    throw new Error(`Local login failed with HTTP ${result.status}: ${JSON.stringify(result.body)}`);
  }
  return result.body.session.accessToken as string;
}

export async function resetLocalDatabase() {
  const local = assertLocalEnvironment();
  loopbackUrl("KUCHIS_LOCAL_DB_URL", local.dbUrl);
  const projectRoot = process.env.KUCHIS_PROJECT_ROOT;
  if (!projectRoot) throw new Error("KUCHIS_PROJECT_ROOT is required for a guarded local reset.");
  const cli = resolve(projectRoot, "node_modules/.bin/supabase");
  const result = spawnSync(cli, ["db", "reset", "--local", "--yes"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Guarded local Supabase reset failed.");
}

export async function fixtures(client: SupabaseClient<Database>) {
  const [productsResult, categoriesResult, pointsResult] = await Promise.all([
    client.from("products").select("id, name, price, preparation_station, allows_additions, category_id, is_active, is_available"),
    client.from("categories").select("id, slug, is_active"),
    client.from("service_points").select("id, name, type, sort_order, is_active").order("sort_order"),
  ]);
  if (productsResult.error || categoriesResult.error || pointsResult.error) {
    throw new Error(
      `Fixture lookup failed: ${productsResult.error?.message ?? categoriesResult.error?.message ?? pointsResult.error?.message}`
    );
  }
  const categories = new Map(categoriesResult.data.map((category) => [category.id, category]));
  const available = productsResult.data.filter((product) => product.is_active && product.is_available);
  const kitchen = available.find((product) => product.preparation_station === "KITCHEN" && product.allows_additions);
  const drinks = available.find((product) => product.preparation_station === "DRINKS");
  const addition = available.find((product) => categories.get(product.category_id)?.slug === "adicionales");
  if (!kitchen || !drinks || !addition || pointsResult.data.length !== 18) {
    throw new Error("Canonical local fixtures are incomplete.");
  }
  return { kitchen, drinks, addition, points: pointsResult.data };
}

export async function openShift(baseUrl: string, token: string, openingCash = 100) {
  const result = await request(baseUrl, "/api/logistics/shifts/open", {
    method: "POST",
    token,
    body: { openingCash },
  });
  if (result.status !== 201) throw new Error(`Open shift failed: ${JSON.stringify(result.body)}`);
  return result.body.shift as ApiBody;
}

export async function openPoint(baseUrl: string, token: string, pointId: string) {
  const result = await request(baseUrl, `/api/logistics/service-points/${pointId}/open`, {
    method: "POST",
    token,
    body: {},
  });
  if (result.status !== 201) throw new Error(`Open service point failed: ${JSON.stringify(result.body)}`);
  return result.body.session as ApiBody;
}

export async function createOrder(
  baseUrl: string,
  token: string,
  sessionId: string,
  items: Array<{ productId: string; quantity: number; additions?: Array<{ productId: string; quantityPerItem: number }> }>
) {
  const result = await request(baseUrl, `/api/logistics/sessions/${sessionId}/orders`, {
    method: "POST",
    token,
    body: { items },
  });
  if (result.status !== 201) throw new Error(`Create order failed: ${JSON.stringify(result.body)}`);
  return result.body.order as ApiBody;
}

export async function deliverItem(baseUrl: string, token: string, itemId: string) {
  for (const action of ["start", "ready", "deliver"]) {
    const result = await request(baseUrl, `/api/logistics/order-items/${itemId}/${action}`, {
      method: "POST",
      token,
      body: {},
    });
    if (result.status !== 200) {
      throw new Error(`Item ${action} failed: ${JSON.stringify(result.body)}`);
    }
  }
}

export async function paySession(
  baseUrl: string,
  token: string,
  sessionId: string,
  method: "CASH" | "YAPE" | "CARD"
) {
  const awaiting = await request(baseUrl, `/api/logistics/sessions/${sessionId}/await-payment`, {
    method: "POST",
    token,
    body: {},
  });
  if (awaiting.status !== 200) throw new Error(`Await payment failed: ${JSON.stringify(awaiting.body)}`);
  const payment = await request(baseUrl, `/api/logistics/sessions/${sessionId}/payments`, {
    method: "POST",
    token,
    body: { method },
  });
  if (payment.status !== 201) throw new Error(`Payment failed: ${JSON.stringify(payment.body)}`);
  return payment.body.payment as ApiBody;
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 8_000,
  intervalMs = 50
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for integration condition.`);
}
