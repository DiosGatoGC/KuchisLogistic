type TimerHandle = ReturnType<typeof setTimeout>;

interface Scheduler {
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer: (handle: TimerHandle) => void;
}

const browserScheduler: Scheduler = {
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle),
};

export function createInvalidationCoordinator(
  invalidate: () => void | Promise<unknown>,
  delayMs = 180,
  scheduler: Scheduler = browserScheduler,
) {
  let timer: TimerHandle | null = null;
  let refreshing = false;
  let pending = false;
  let disposed = false;

  const run = async () => {
    if (disposed) return;
    if (refreshing) {
      pending = true;
      return;
    }
    refreshing = true;
    try {
      await invalidate();
    } catch {
      // REST views keep their own visible error/retry state. Realtime remains a hint.
    } finally {
      refreshing = false;
      if (pending && !disposed) {
        pending = false;
        void run();
      }
    }
  };

  const schedule = () => {
    if (disposed || timer !== null) return;
    timer = scheduler.setTimer(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  return {
    schedule,
    refreshNow() {
      if (timer !== null) {
        scheduler.clearTimer(timer);
        timer = null;
      }
      void run();
    },
    dispose() {
      disposed = true;
      pending = false;
      if (timer !== null) scheduler.clearTimer(timer);
      timer = null;
    },
  };
}
