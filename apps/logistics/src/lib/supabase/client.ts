import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { PUBLIC_FRONTEND_CONFIG } from "@/lib/config/public-config";

let browserClient: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;

  if (!PUBLIC_FRONTEND_CONFIG.ok) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createClient(
    PUBLIC_FRONTEND_CONFIG.value.supabaseUrl,
    PUBLIC_FRONTEND_CONFIG.value.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    },
  );

  return browserClient;
}
