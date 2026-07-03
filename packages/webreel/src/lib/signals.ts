type CleanupFn = () => void | Promise<void>;

const cleanups = new Set<CleanupFn>();

/**
 * Register a cleanup to run if the process is interrupted (SIGINT/SIGTERM).
 * Returns an unregister function; call it once the resources are released
 * through the normal path.
 */
export function registerInterruptCleanup(fn: CleanupFn): () => void {
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}

export async function runInterruptCleanups(): Promise<void> {
  // Most-recently-registered first so resources unwind in reverse
  // acquisition order.
  const pending = [...cleanups].reverse();
  cleanups.clear();
  for (const fn of pending) {
    try {
      await fn();
    } catch (err) {
      console.warn("Cleanup failed during shutdown:", err);
    }
  }
}

export interface SignalHandlerOptions {
  /**
   * Runs before registered cleanups. May return an exit code to use
   * instead of the default 130 (SIGINT) / 143 (SIGTERM).
   */
  beforeExit?: (signal: NodeJS.Signals) => number | void | Promise<number | void>;
}

const FORCE_EXIT_TIMEOUT_MS = 10_000;

/**
 * Install SIGINT/SIGTERM handlers that run registered cleanups before
 * exiting. A second signal, or cleanup taking longer than 10 seconds,
 * forces an immediate exit. The timeout does not cover beforeExit, which
 * may legitimately wait on long work (watch mode waits for an in-flight
 * recording); a second signal remains the escape hatch there. Returns an
 * uninstall function.
 */
export function installSignalHandlers(options?: SignalHandlerOptions): () => void {
  let shuttingDown = false;

  const onSignal = (signal: NodeJS.Signals) => {
    const defaultCode = signal === "SIGTERM" ? 143 : 130;
    if (shuttingDown) {
      process.exit(defaultCode);
    }
    shuttingDown = true;
    console.log("\nInterrupted. Cleaning up...");

    void (async () => {
      let code: number | void = undefined;
      try {
        code = await options?.beforeExit?.(signal);
      } catch (err) {
        console.warn("Shutdown hook failed:", err);
      }
      const forceExit = setTimeout(
        () => process.exit(defaultCode),
        FORCE_EXIT_TIMEOUT_MS,
      );
      forceExit.unref();
      await runInterruptCleanups();
      process.exit(typeof code === "number" ? code : defaultCode);
    })();
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return () => {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  };
}
