export const waitMs = 20_000;
export const lookEveryMs = 1_000;

export type Changes = { check(): void; version(): number; wait(after: number, signal: AbortSignal, ms?: number): Promise<void> };

export function createChanges(snapshot: () => unknown, everyMs = lookEveryMs): Changes {
  let version = 0;
  let seen = JSON.stringify(snapshot());
  const waiters = new Set<() => void>();
  let looking: ReturnType<typeof setInterval> | null = null;
  const check = () => {
    const now = JSON.stringify(snapshot());
    if (now === seen) return;
    seen = now;
    version++;
    for (const wake of [...waiters]) wake();
  };
  return {
    check,
    version: () => version,
    wait(after, signal, ms = waitMs) {
      if (version > after || signal.aborted) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          waiters.delete(done);
          if (waiters.size === 0 && looking !== null) {
            clearInterval(looking);
            looking = null;
          }
          resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener("abort", done, { once: true });
        waiters.add(done);
        looking ??= setInterval(check, everyMs);
      });
    },
  };
}
