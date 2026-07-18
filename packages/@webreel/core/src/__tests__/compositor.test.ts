import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compose } from "../compositor.js";
import { InteractionTimeline } from "../timeline.js";

let ffmpegPathResolver: () => Promise<string>;
vi.mock("../ffmpeg.js", () => ({
  ensureFfmpeg: () => ffmpegPathResolver(),
}));

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "webreel-compositor-test-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("compose", () => {
  it("rejects instead of hanging when ffmpeg dies before reading any input", async () => {
    // Exits immediately without reading stdin at all, so the very first
    // piped overlay frame lands on an already-dead pipe. With enough
    // frames queued behind it, the producer/consumer loop is forced into
    // real backpressure (stdin.write returning false) against a process
    // that will never emit 'drain'.
    const dyingShimPath = join(workDir, "dying-ffmpeg");
    writeFileSync(dyingShimPath, "#!/bin/sh\nexit 1\n");
    chmodSync(dyingShimPath, 0o755);
    ffmpegPathResolver = () => Promise.resolve(dyingShimPath);

    const unhandledRejectionSpy = vi.fn();
    process.on("unhandledRejection", unhandledRejectionSpy);

    try {
      // A larger canvas with a moving cursor and changing HUD text keeps
      // every frame's overlay PNG distinct (no cache hits) and large
      // enough, across many frames, to exceed stdin's internal buffer.
      const timeline = new InteractionTimeline(480, 480);
      const path = Array.from({ length: 60 }, (_, i) => ({
        x: (i * 7) % 460,
        y: (i * 11) % 460,
      }));
      timeline.setCursorPath(path);
      for (let i = 0; i < path.length; i++) {
        timeline.showHud([`step ${i}`, `frame-${i}-of-${path.length}`]);
        timeline.tick();
      }
      const timelineData = timeline.toJSON();

      // The shim never reads this as a real video; ffmpeg's own -i
      // handling is entirely bypassed by the shim script.
      const cleanVideoPath = join(workDir, "clean.mp4");
      writeFileSync(cleanVideoPath, "not a real video");

      // .gif output takes the single-pass compositeFrames path directly
      // (no finalize stage), keeping the shim's job simple.
      const outputPath = join(workDir, "out.gif");

      await expect(compose(cleanVideoPath, timelineData, outputPath)).rejects.toThrow();

      // Give a dangling ffmpegDone rejection (if any) a turn to surface.
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandledRejectionSpy).not.toHaveBeenCalled();
    } finally {
      process.removeListener("unhandledRejection", unhandledRejectionSpy);
    }
  }, 10_000);
});
