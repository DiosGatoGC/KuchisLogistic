export interface PublicFrontendConfig {
  logisticsApiUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export interface PublicFrontendEnvironment {
  NEXT_PUBLIC_LOGISTICS_API_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}

export type PublicFrontendConfigResult =
  | { ok: true; value: PublicFrontendConfig }
  | { ok: false; invalidVariables: string[] };

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isKnownPrivateSupabaseKey(value: string) {
  if (value.toLowerCase().startsWith("sb_secret_")) return true;

  const encodedPayload = value.split(".")[1];
  if (!encodedPayload) return false;

  try {
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function normalizedHttpOrigin(value: string | undefined): string | null {
  const configured = value?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    const isLocalHttp =
      url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname);

    if (
      (url.protocol !== "https:" && !isLocalHttp) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function validatePublicFrontendConfig(
  environment: PublicFrontendEnvironment,
): PublicFrontendConfigResult {
  const logisticsApiUrl = normalizedHttpOrigin(
    environment.NEXT_PUBLIC_LOGISTICS_API_URL,
  );
  const supabaseUrl = normalizedHttpOrigin(
    environment.NEXT_PUBLIC_SUPABASE_URL,
  );
  const supabasePublishableKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || null;
  const invalidVariables: string[] = [];

  if (!logisticsApiUrl) invalidVariables.push("NEXT_PUBLIC_LOGISTICS_API_URL");
  if (!supabaseUrl) invalidVariables.push("NEXT_PUBLIC_SUPABASE_URL");
  if (
    !supabasePublishableKey ||
    isKnownPrivateSupabaseKey(supabasePublishableKey)
  ) {
    invalidVariables.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (invalidVariables.length > 0) {
    return { ok: false, invalidVariables };
  }

  return {
    ok: true,
    value: {
      logisticsApiUrl: logisticsApiUrl!,
      supabaseUrl: supabaseUrl!,
      supabasePublishableKey: supabasePublishableKey!,
    },
  };
}

export function publicConfigurationErrorMessage(
  result: Extract<PublicFrontendConfigResult, { ok: false }>,
) {
  return `Falta configurar correctamente: ${result.invalidVariables.join(", ")}.`;
}

export function apiRequestUrl(baseUrl: string, path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("La ruta de Logistics debe ser relativa al origen configurado.");
  }
  return `${baseUrl}${path}`;
}

export const PUBLIC_FRONTEND_CONFIG = validatePublicFrontendConfig({
  NEXT_PUBLIC_LOGISTICS_API_URL:
    process.env.NEXT_PUBLIC_LOGISTICS_API_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
