import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFfmpegSync, runFfmpegAsync, spawnFfmpegStreaming } from "../ffmpeg-run.js";

let shimDir: string;

beforeEach(() => {
  shimDir = mkdtempSync(join(tmpdir(), "webreel-ffmpeg-run-test-"));
});

afterEach(() => {
  rmSync(shimDir, { recursive: true, force: true });
});

function writeShim(name: string, script: string): string {
  const shimPath = join(shimDir, name);
  writeFileSync(shimPath, script);
  chmodSync(shimPath, 0o755);
  return shimPath;
}

describe("runFfmpegSync", () => {
  it("returns without throwing when the process exits 0", () => {
    const shim = writeShim("ok", "#!/bin/sh\nexit 0\n");
    expect(() => runFfmpegSync(shim, ["-y"], "test-sync")).not.toThrow();
  });

  it("throws a stage-named error with the stderr tail when the process exits non-zero", () => {
    const shim = writeShim("fail", "#!/bin/sh\necho 'boom details' 1>&2\nexit 1\n");
    expect(() => runFfmpegSync(shim, ["-y"], "test-sync")).toThrow(
      /test-sync exited with code 1[\s\S]*boom details/,
    );
  });
});

describe("runFfmpegAsync", () => {
  it("resolves when the process exits 0", async () => {
    const shim = writeShim("ok", "#!/bin/sh\nexit 0\n");
    await expect(runFfmpegAsync(shim, ["-y"], "test-async")).resolves.toBeUndefined();
  });

  it("rejects with a stage-named error with the stderr tail on non-zero exit", async () => {
    const shim = writeShim("fail", "#!/bin/sh\necho 'async boom' 1>&2\nexit 2\n");
    await expect(runFfmpegAsync(shim, ["-y"], "test-async")).rejects.toThrow(
      /test-async exited with code 2[\s\S]*async boom/,
    );
  });
});

describe("spawnFfmpegStreaming", () => {
  it("resolves `done` when the process reads stdin to EOF and exits 0", async () => {
    const shim = writeShim("drain", "#!/bin/sh\ncat > /dev/null\nexit 0\n");
    const handle = spawnFfmpegStreaming(shim, [], "test-stream");
    handle.stdin.end("hello");
    await expect(handle.done).resolves.toBeUndefined();
  });

  it("rejects `done` with a stage-named, stderr-tailed error on non-zero exit", async () => {
    const shim = writeShim(
      "fail",
      "#!/bin/sh\ncat > /dev/null\necho 'stream boom' 1>&2\nexit 1\n",
    );
    const handle = spawnFfmpegStreaming(shim, [], "test-stream");
    handle.stdin.end("hello");
    await expect(handle.done).rejects.toThrow(
      /test-stream exited with code 1[\s\S]*stream boom/,
    );
  });

  it("fires onPrematureClose when the process exits non-zero before stdin.end() was called", async () => {
    // Exits immediately without reading stdin, so the close race happens
    // before we ever call stdin.end().
    const shim = writeShim("dying", "#!/bin/sh\nexit 1\n");
    const onPrematureClose = vi.fn();
    const onPipeError = vi.fn();
    const handle = spawnFfmpegStreaming(shim, [], "test-stream", {
      onPrematureClose,
      onPipeError,
    });

    await expect(handle.done).rejects.toThrow(/test-stream exited with code 1/);
    expect(onPrematureClose).toHaveBeenCalledTimes(1);
    expect(onPrematureClose.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onPipeError).not.toHaveBeenCalled();
  });

  it("does not fire onPrematureClose when the process closes after stdin.end() was called", async () => {
    const shim = writeShim("fail-after-end", "#!/bin/sh\ncat > /dev/null\nexit 1\n");
    const onPrematureClose = vi.fn();
    const handle = spawnFfmpegStreaming(shim, [], "test-stream", { onPrematureClose });
    handle.stdin.end("hello");

    await expect(handle.done).rejects.toThrow();
    expect(onPrematureClose).not.toHaveBeenCalled();
  });

  it("fires onPipeError on a genuine stdin EPIPE while the process is still alive", async () => {
    // Closes its own stdin fd and sleeps (stays alive) instead of exiting,
    // so writes from the Node side hit a real EPIPE rather than racing an
    // auto-destroyed stdin from a 'close' event.
    const shim = writeShim("closes-stdin", "#!/bin/sh\nexec 0<&-\nsleep 5\n");
    const onPipeError = vi.fn();
    const handle = spawnFfmpegStreaming(shim, [], "test-stream", { onPipeError });

    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 20 && onPipeError.mock.calls.length === 0; i++) {
      handle.stdin.write(Buffer.alloc(65536, "x"));
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(onPipeError).toHaveBeenCalledTimes(1);
    expect(onPipeError.mock.calls[0][0].code).toBe("EPIPE");
    handle.kill();
    await handle.done.catch(() => {});
  }, 10_000);

  it("suppresses onPipeError for an EPIPE emitted after stdin has already been ended", async () => {
    const shim = writeShim("drain", "#!/bin/sh\ncat > /dev/null\nexit 0\n");
    const onPipeError = vi.fn();
    const handle = spawnFfmpegStreaming(shim, [], "test-stream", { onPipeError });

    handle.stdin.end();
    expect(handle.stdin.writableEnded).toBe(true);
    // Simulate a benign EPIPE landing after end() was called; the stream
    // itself must have an 'error' listener attached (asserted implicitly:
    // if the helper didn't attach one, this emit would crash the process).
    const epipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    handle.stdin.emit("error", epipe);

    expect(onPipeError).not.toHaveBeenCalled();
  });

  it("kill() escalates to SIGKILL when the process ignores SIGTERM", async () => {
    // A real Node child (rather than a shell trap) so signal delivery and
    // the resulting 'close' event are unambiguous, matching the pattern
    // process.test.ts uses for the equivalent killProcess() escalation test.
    const handle = spawnFfmpegStreaming(
      process.execPath,
      ["-e", 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'],
      "test-stream",
    );
    // Give the child a moment to install its SIGTERM handler.
    await new Promise((r) => setTimeout(r, 300));

    const closed = new Promise<void>((resolve) => {
      handle.proc.once("close", () => resolve());
    });
    handle.kill();
    await closed;

    expect(handle.proc.signalCode).toBe("SIGKILL");
  }, 10_000);

  it("clears the SIGKILL timer once the process closes normally after SIGTERM", async () => {
    const handle = spawnFfmpegStreaming(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000);"],
      "test-stream",
    );

    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    const closed = new Promise<void>((resolve) => {
      handle.proc.once("close", () => resolve());
    });
    handle.kill();
    await closed;

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  }, 10_000);
});
