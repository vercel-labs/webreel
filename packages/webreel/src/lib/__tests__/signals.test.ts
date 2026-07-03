import { describe, it, expect, vi } from "vitest";
import {
  registerInterruptCleanup,
  runInterruptCleanups,
  installSignalHandlers,
} from "../signals.js";

describe("interrupt cleanups", () => {
  it("runs registered cleanups in reverse registration order", async () => {
    const order: string[] = [];
    registerInterruptCleanup(() => {
      order.push("first");
    });
    registerInterruptCleanup(() => {
      order.push("second");
    });
    await runInterruptCleanups();
    expect(order).toEqual(["second", "first"]);
  });

  it("does not run unregistered cleanups", async () => {
    const fn = vi.fn();
    const unregister = registerInterruptCleanup(fn);
    unregister();
    await runInterruptCleanups();
    expect(fn).not.toHaveBeenCalled();
  });

  it("runs each cleanup only once across invocations", async () => {
    const fn = vi.fn();
    registerInterruptCleanup(fn);
    await runInterruptCleanups();
    await runInterruptCleanups();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("continues past a failing cleanup", async () => {
    const ran = vi.fn();
    registerInterruptCleanup(ran);
    registerInterruptCleanup(() => {
      throw new Error("boom");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runInterruptCleanups();
    warn.mockRestore();
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("awaits async cleanups", async () => {
    let done = false;
    registerInterruptCleanup(async () => {
      await new Promise((r) => setTimeout(r, 10));
      done = true;
    });
    await runInterruptCleanups();
    expect(done).toBe(true);
  });
});

describe("installSignalHandlers", () => {
  it("adds and removes SIGINT/SIGTERM listeners", () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");
    const uninstall = installSignalHandlers();
    expect(process.listenerCount("SIGINT")).toBe(sigintBefore + 1);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore + 1);
    uninstall();
    expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
  });
});
