export const LOGISTICS_SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
] as const;

export const SERVICE_WORKER_HEADERS = [
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  { key: "Service-Worker-Allowed", value: "/" },
] as const;
