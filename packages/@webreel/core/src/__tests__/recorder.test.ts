import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Recorder } from "../recorder.js";
import { InteractionTimeline } from "../timeline.js";
import type { CDPClient } from "../types.js";

let ffmpegPathResolver: () => Promise<string>;
vi.mock("../ffmpeg.js", () => ({
  ensureFfmpeg: () => ffmpegPathResolver(),
}));

// A 1x1 white JPEG, enough for the capture loop to treat as a frame.
const TINY_JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";

let shimDir: string;
let shimPath: string;

beforeEach(() => {
  shimDir = mkdtempSync(join(tmpdir(), "webreel-recorder-test-"));
  shimPath = join(shimDir, "fake-ffmpeg");
  // Drains stdin and exits on EOF, standing in for ffmpeg.
  writeFileSync(shimPath, "#!/bin/sh\ncat > /dev/null\n");
  chmodSync(shimPath, 0o755);
  ffmpegPathResolver = () => Promise.resolve(shimPath);
});

afterEach(() => {
  rmSync(shimDir, { recursive: true, force: true });
});

function fakeClient(): CDPClient {
  return {
    Page: {
      captureScreenshot: async () => {
        // Pace the capture loop so it does not spin hot against the shim.
        await new Promise((r) => setTimeout(r, 5));
        return { data: TINY_JPEG };
      },
    },
    Runtime: {
      evaluate: async () => ({ result: {} }),
    },
  } as unknown as CDPClient;
}

async function startedRecorder(): Promise<Recorder> {
  const recorder = new Recorder(64, 64);
  recorder.setTimeline(new InteractionTimeline(64, 64));
  await recorder.start(fakeClient(), join(shimDir, "out.mp4"));
  await new Promise((r) => setTimeout(r, 30));
  return recorder;
}

describe("Recorder.stop", () => {
  it("memoizes shutdown so concurrent callers share one stop", async () => {
    const recorder = await startedRecorder();

    const first = recorder.stop();
    const second = recorder.stop();
    expect(second).toBe(first);
    await Promise.all([first, second]);

    // Stop after completion still returns the settled shutdown.
    expect(recorder.stop()).toBe(first);
  });

  it("start resets the memoized stop for reuse", async () => {
    const recorder = await startedRecorder();
    const firstStop = recorder.stop();
    await firstStop;

    await recorder.start(fakeClient(), join(shimDir, "out2.mp4"));
    await new Promise((r) => setTimeout(r, 20));
    const secondStop = recorder.stop();
    expect(secondStop).not.toBe(firstStop);
    await secondStop;
  });

  it("aborts start when stop arrives while ensureFfmpeg is in flight", async () => {
    let releaseFfmpeg!: (path: string) => void;
    ffmpegPathResolver = () =>
      new Promise<string>((resolve) => {
        releaseFfmpeg = resolve;
      });

    const recorder = new Recorder(64, 64);
    recorder.setTimeline(new InteractionTimeline(64, 64));
    const starting = recorder.start(fakeClient(), join(shimDir, "out.mp4"));
    await new Promise((r) => setTimeout(r, 10));

    // Interrupt-style stop while start is suspended on the download.
    await recorder.stop();
    releaseFfmpeg(shimPath);
    await starting;

    // Start must not have revived the recorder or spawned ffmpeg.
    expect(recorder.getTempVideoPath()).toBe("");
  });
});

describe("Recorder pipe error handling", () => {
  it("survives ffmpeg dying mid-recording without an uncaught exception", async () => {
    // Reads a little input then exits nonzero, so later writeFrame() calls
    // hit a dead pipe (EPIPE) instead of a live ffmpeg process.
    const dyingShimPath = join(shimDir, "dying-ffmpeg");
    writeFileSync(dyingShimPath, "#!/bin/sh\nhead -c 100 > /dev/null\nexit 1\n");
    chmodSync(dyingShimPath, 0o755);
    ffmpegPathResolver = () => Promise.resolve(dyingShimPath);

    const uncaughtSpy = vi.fn();
    process.on("uncaughtException", uncaughtSpy);

    try {
      const recorder = await startedRecorder();
      // Give the capture loop time to keep writing after the shim exits.
      await new Promise((r) => setTimeout(r, 100));
      await recorder.stop();
      expect(uncaughtSpy).not.toHaveBeenCalled();
    } finally {
      process.removeListener("uncaughtException", uncaughtSpy);
    }
  });
});
