import { createClient } from "@supabase/supabase-js";
import type { Database } from "@kuchis/shared/database-types";
import { env, type ApiEnv } from "./env";
import { createTimeoutFetch } from "./supabase-fetch";

const serverAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

export function createSupabaseClientOptions(fetchImpl: typeof globalThis.fetch) {
  return {
    auth: serverAuthOptions,
    global: { fetch: fetchImpl },
  } as const;
}

export const supabaseFetch = createTimeoutFetch(env.SUPABASE_REQUEST_TIMEOUT_MS);

export function createSupabaseAdminClient(
  config: ApiEnv = env,
  fetchImpl: typeof globalThis.fetch = supabaseFetch
) {
  return createClient<Database>(
    config.SUPABASE_URL,
    config.SUPABASE_SECRET_KEY,
    createSupabaseClientOptions(fetchImpl)
  );
}

export const supabaseAdmin = createSupabaseAdminClient();

// A fresh client keeps each worker's Auth session isolated from both other
// requests and the administrative Data API client.
export function createSupabaseAuthClient(
  config: ApiEnv = env,
  fetchImpl: typeof globalThis.fetch = supabaseFetch
) {
  return createClient<Database>(
    config.SUPABASE_URL,
    config.SUPABASE_SECRET_KEY,
    createSupabaseClientOptions(fetchImpl)
  );
}
