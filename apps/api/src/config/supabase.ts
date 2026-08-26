import { createClient } from "@supabase/supabase-js";
import type { Database } from "@kuchis/shared/database-types";
import { env } from "./env";

const serverAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

export const supabaseAdmin = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  {
    auth: serverAuthOptions,
  }
);

// A fresh client keeps each worker's Auth session isolated from both other
// requests and the administrative Data API client.
export function createSupabaseAuthClient() {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: serverAuthOptions,
  });
}
