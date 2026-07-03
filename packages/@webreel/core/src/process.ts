import type { ChildProcess } from "node:child_process";

// exitCode stays null when a process dies from a signal; check both so an
// already-dead process is never mistaken for a live one.
export function hasExited(proc: ChildProcess): boolean {
  return proc.exitCode !== null || proc.signalCode !== null;
}

/**
 * Send a signal and wait for the process to exit, escalating to SIGKILL
 * after timeoutMs. Resolves once the process is gone. Safe to call on a
 * process that already exited and safe to call concurrently.
 */
export async function killProcess(
  proc: ChildProcess,
  timeoutMs = 3000,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  if (hasExited(proc)) return;

  const exited = new Promise<void>((resolve) => {
    proc.once("exit", () => resolve());
  });

  try {
    proc.kill(signal);
  } catch {
    // Process disappeared between the liveness check and the signal.
    return;
  }

  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), timeoutMs);
  });
  const needsForceKill = await Promise.race([exited.then(() => false), timedOut]);
  clearTimeout(timer);

  if (needsForceKill) {
    if (hasExited(proc)) return;
    try {
      proc.kill("SIGKILL");
    } catch {
      return;
    }
    await exited;
  }
}
