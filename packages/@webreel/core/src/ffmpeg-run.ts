import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { Writable } from "node:stream";
import { hasExited } from "./process.js";

// Shared across every ffmpeg invocation: only the last couple KB of stderr
// are useful for diagnosing a failure, and buffering more than that in an
// error message is just noise.
const STDERR_TAIL_BYTES = 2000;

function tailOf(buf: Buffer): string {
  return buf.toString().slice(-STDERR_TAIL_BYTES);
}

/**
 * Run ffmpeg synchronously to completion (spawnSync), throwing an Error
 * named after `stage` with the last STDERR_TAIL_BYTES of stderr appended
 * when it exits non-zero.
 */
export function runFfmpegSync(
  ffmpegPath: string,
  args: string[],
  stage = "ffmpeg",
): void {
  const result = spawnSync(ffmpegPath, args, {
    stdio: "pipe",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? tailOf(result.stderr) : "";
    throw new Error(
      `${stage} exited with code ${result.status}${stderr ? `:\n${stderr}` : ""}`,
    );
  }
}

/**
 * Run ffmpeg asynchronously to completion for file-in/file-out invocations
 * that don't pipe stdin (e.g. a single -i/-vf/-o pass). Resolves on a clean
 * (code 0) close; rejects with a `${stage}`-named, stderr-tailed Error
 * otherwise.
 */
export function runFfmpegAsync(
  ffmpegPath: string,
  args: string[],
  stage = "ffmpeg",
): Promise<void> {
  const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });

  const stderrChunks: Buffer[] = [];
  proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  return new Promise<void>((resolveAll, rejectAll) => {
    proc.on("close", (code) => {
      if (code === 0) {
        resolveAll();
        return;
      }
      const stderr = tailOf(Buffer.concat(stderrChunks));
      rejectAll(
        new Error(`${stage} exited with code ${code}${stderr ? `:\n${stderr}` : ""}`),
      );
    });
    proc.on("error", rejectAll);
  });
}

export interface FfmpegStreamingOptions {
  /**
   * Fired when stdin emits an 'error' event that isn't a benign EPIPE after
   * stdin has already been ended (i.e. ffmpeg died mid-stream). Without a
   * listener Node treats an unhandled stream 'error' as an uncaught
   * exception, so callers should always use this to record/react to the
   * failure instead of leaving the pipe unattended.
   */
  onPipeError?: (err: NodeJS.ErrnoException) => void;
  /**
   * Fired when the process closes with a non-zero code before stdin was
   * ended. A close that races ahead of stdin.end() means the producer/
   * consumer loop writing to stdin can't rely solely on a subsequent stdin
   * 'error' event to unblock: once Node auto-destroys an already-closed
   * process's stdin, further writes can return false with no further
   * 'error' or 'drain' event ever firing. Treat this as an abort signal.
   */
  onPrematureClose?: (err: Error) => void;
}

export interface FfmpegStreamingHandle {
  proc: ChildProcess;
  stdin: Writable;
  /** Resolves on a clean (code 0) close; rejects with a `${stage}`-named,
   * stderr-tailed Error otherwise. A no-op .catch() is attached internally
   * so an early rejection (e.g. from the abort path killing the process)
   * never surfaces as an unhandled rejection; callers should still await
   * `done` for its real outcome. */
  done: Promise<void>;
  /** SIGTERM, then SIGKILL after a grace period if the process hasn't
   * closed by then. The SIGKILL timer is unref'd (never keeps the process
   * alive on its own) and cleared as soon as 'close' fires. */
  kill(): void;
}

const KILL_GRACE_MS = 5_000;

/**
 * Spawn ffmpeg with a piped stdin/stdout/stderr for streaming input (e.g.
 * image2pipe frame feeding). Centralizes stderr-tail capture, close/error
 * promise wiring, the stdin error contract, and SIGTERM->SIGKILL kill
 * escalation so every streaming call site shares the same failure
 * semantics.
 */
export function spawnFfmpegStreaming(
  ffmpegPath: string,
  args: string[],
  stage: string,
  opts: FfmpegStreamingOptions = {},
): FfmpegStreamingHandle {
  const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });

  const stdin = proc.stdin;
  if (!stdin) throw new Error(`${stage} process has no stdin pipe`);

  const stderrChunks: Buffer[] = [];
  proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  // Register close/error listeners immediately to avoid missing events.
  const done = new Promise<void>((resolveAll, rejectAll) => {
    proc.on("close", (code) => {
      if (code === 0) {
        resolveAll();
        return;
      }
      const stderr = tailOf(Buffer.concat(stderrChunks));
      const err = new Error(
        `${stage} exited with code ${code}${stderr ? `:\n${stderr}` : ""}`,
      );
      rejectAll(err);

      // See onPrematureClose doc above for why this matters.
      if (!stdin.writableEnded) opts.onPrematureClose?.(err);
    });
    proc.on("error", rejectAll);
  });
  // done can reject as soon as the process exits, which may be well before
  // the caller's abort branch (or its own `await done`) has a chance to
  // observe it. Attach a no-op handler now so Node never sees an unhandled
  // rejection in that window; the promise is still returned for its real
  // outcome.
  done.catch(() => {});

  // EPIPE is expected once ffmpeg has finished reading and the caller has
  // called stdin.end(). Before that, it means ffmpeg died mid-stream.
  stdin.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE" && stdin.writableEnded) return;
    opts.onPipeError?.(err);
  });

  const kill = () => {
    proc.kill("SIGTERM");
    const killTimer = setTimeout(() => {
      // proc.killed only reflects that a kill() call was made, not that the
      // process actually died - check real exit status instead so a target
      // that ignores SIGTERM (e.g. traps it) actually gets escalated to
      // SIGKILL instead of the timer silently no-oping forever.
      if (!hasExited(proc)) proc.kill("SIGKILL");
    }, KILL_GRACE_MS);
    killTimer.unref();
    proc.once("close", () => clearTimeout(killTimer));
  };

  return { proc, stdin, done, kill };
}
