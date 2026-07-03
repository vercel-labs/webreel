import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { hasExited, killProcess } from "../process.js";

function spawnLongRunning(setup = "") {
  return spawn(process.execPath, ["-e", `${setup}setInterval(() => {}, 1000);`]);
}

function waitForExit(proc: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve) => {
    if (hasExited(proc)) return resolve();
    proc.once("exit", () => resolve());
  });
}

describe("hasExited", () => {
  it("is false for a running process and true after exit", async () => {
    const proc = spawnLongRunning();
    expect(hasExited(proc)).toBe(false);
    proc.kill("SIGKILL");
    await waitForExit(proc);
    expect(hasExited(proc)).toBe(true);
  });

  it("detects a signal-killed process even though exitCode is null", async () => {
    const proc = spawnLongRunning();
    proc.kill("SIGKILL");
    await waitForExit(proc);
    expect(proc.exitCode).toBeNull();
    expect(proc.signalCode).toBe("SIGKILL");
    expect(hasExited(proc)).toBe(true);
  });
});

describe("killProcess", () => {
  it("terminates a running process", async () => {
    const proc = spawnLongRunning();
    await killProcess(proc, 3000);
    expect(hasExited(proc)).toBe(true);
  });

  it("returns immediately for an already-exited process", async () => {
    const proc = spawnLongRunning();
    proc.kill("SIGKILL");
    await waitForExit(proc);

    const start = Date.now();
    await killProcess(proc, 3000);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("escalates to SIGKILL when the process ignores the signal", async () => {
    const proc = spawnLongRunning('process.on("SIGTERM", () => {});');
    // Give the child a moment to install its SIGTERM handler.
    await new Promise((r) => setTimeout(r, 300));
    await killProcess(proc, 200);
    expect(hasExited(proc)).toBe(true);
    expect(proc.signalCode).toBe("SIGKILL");
  });

  it("is safe to call concurrently", async () => {
    const proc = spawnLongRunning();
    await Promise.all([killProcess(proc, 3000), killProcess(proc, 3000)]);
    expect(hasExited(proc)).toBe(true);
  });
});
