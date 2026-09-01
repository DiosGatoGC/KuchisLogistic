import { env } from "../config/env";
import { supabaseAdmin } from "../config/supabase";

export const READINESS_CACHE_TTL_MS = 3_000;

export type ReadinessProbe = (signal: AbortSignal) => Promise<void>;

export interface ReadinessChecker {
  check(): Promise<boolean>;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface ReadinessRuntime {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export async function probeSupabaseReadiness(signal: AbortSignal): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .limit(1)
    .abortSignal(signal);

  if (error) throw new Error("Supabase readiness dependency failed.");
}

export function createReadinessService(options: {
  probe: ReadinessProbe;
  timeoutMs: number;
  ttlMs?: number;
  runtime?: Partial<ReadinessRuntime>;
}): ReadinessChecker {
  const ttlMs = options.ttlMs ?? READINESS_CACHE_TTL_MS;
  const now = options.runtime?.now ?? Date.now;
  const schedule: ReadinessRuntime["setTimeout"] =
    options.runtime?.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel: ReadinessRuntime["clearTimeout"] =
    options.runtime?.clearTimeout ?? ((handle) => clearTimeout(handle));
  let cached: { ready: boolean; expiresAt: number } | null = null;
  let inFlight: Promise<boolean> | null = null;

  async function runProbe() {
    const controller = new AbortController();
    const timer = schedule(() => controller.abort(), options.timeoutMs);
    try {
      await options.probe(controller.signal);
      return true;
    } catch {
      return false;
    } finally {
      cancel(timer);
    }
  }

  return {
    async check() {
      const currentTime = now();
      if (cached && currentTime < cached.expiresAt) return cached.ready;
      if (inFlight) return inFlight;

      const currentProbe = runProbe().then((ready) => {
        cached = { ready, expiresAt: now() + ttlMs };
        return ready;
      });
      inFlight = currentProbe;

      try {
        return await currentProbe;
      } finally {
        if (inFlight === currentProbe) inFlight = null;
      }
    },
  };
}

export const readinessService = createReadinessService({
  probe: probeSupabaseReadiness,
  timeoutMs: env.READINESS_TIMEOUT_MS,
});
