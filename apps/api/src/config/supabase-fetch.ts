export class SupabaseRequestTimeoutError extends Error {
  constructor() {
    super("Supabase request timed out.");
    this.name = "SupabaseRequestTimeoutError";
  }
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface TimeoutFetchRuntime {
  fetch: typeof globalThis.fetch;
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

function signalFromRequest(input: RequestInfo | URL) {
  return typeof Request !== "undefined" && input instanceof Request
    ? input.signal
    : undefined;
}

export function createTimeoutFetch(
  timeoutMs: number,
  overrides: Partial<TimeoutFetchRuntime> = {}
): typeof globalThis.fetch {
  const fetchImpl = overrides.fetch ?? globalThis.fetch.bind(globalThis);
  const schedule: TimeoutFetchRuntime["setTimeout"] =
    overrides.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel: TimeoutFetchRuntime["clearTimeout"] =
    overrides.clearTimeout ?? ((handle) => clearTimeout(handle));

  return async (input, init) => {
    const controller = new AbortController();
    const signals = [signalFromRequest(input), init?.signal]
      .filter((signal): signal is AbortSignal => signal !== undefined)
      .filter((signal, index, values) => values.indexOf(signal) === index);
    const listeners: Array<{ signal: AbortSignal; listener: () => void }> = [];
    let timedOut = false;

    for (const signal of signals) {
      const forwardAbort = () => {
        if (!controller.signal.aborted) controller.abort(signal.reason);
      };
      if (signal.aborted) {
        forwardAbort();
        break;
      }
      signal.addEventListener("abort", forwardAbort, { once: true });
      listeners.push({ signal, listener: forwardAbort });
    }

    const timer = controller.signal.aborted
      ? undefined
      : schedule(() => {
          if (controller.signal.aborted) return;
          timedOut = true;
          controller.abort(new SupabaseRequestTimeoutError());
        }, timeoutMs);

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new SupabaseRequestTimeoutError();
      throw error;
    } finally {
      if (timer !== undefined) cancel(timer);
      for (const { signal, listener } of listeners) {
        signal.removeEventListener("abort", listener);
      }
    }
  };
}
