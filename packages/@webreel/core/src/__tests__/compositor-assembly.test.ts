import { describe, it, expect, vi } from "vitest";
import type { TimelineData } from "../timeline.js";
import { DEFAULT_CURSOR_SVG, DEFAULT_CURSOR_SIZE, DEFAULT_HUD_THEME } from "../types.js";

// Characterizes the pure ffmpeg-argument assembly in compositor.ts, plus the
// autozoom "zoom pass" invocation, without spawning real ffmpeg. `spawn` and
// `spawnSync` are faked at the node:child_process boundary (the shim-process
// pattern from recorder.test.ts, adapted to child_process instead of a real
// binary), so `compose()` can run its full three-stage pipeline in-process.

const hoisted = vi.hoisted(() => {
  function makeFakeChildProcess() {
    return {
      stdin: {
        write: () => true,
        end: () => {},
        once: (event: string, cb: () => void) => {
          if (event === "drain") cb();
        },
        on: () => {},
      },
      stderr: { on: () => {} },
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (event === "close") queueMicrotask(() => cb(0));
      },
      kill: () => {},
    };
  }

  const spawnCalls: string[][] = [];
  const spawnMock = (_cmd: string, args: string[]) => {
    spawnCalls.push(args);
    return makeFakeChildProcess();
  };
  const spawnSyncMock = () => ({ status: 0, stderr: Buffer.from("") });

  return { spawnCalls, spawnMock, spawnSyncMock };
});

const { spawnCalls, spawnMock, spawnSyncMock } = hoisted;

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

vi.mock("../ffmpeg.js", () => ({
  ensureFfmpeg: async () => "/fake/ffmpeg",
}));

const { compose, buildMp4Config, buildGifConfig } = await import("../compositor.js");

describe("buildMp4Config", () => {
  it("enables faststart and embeds the given fps/crf", () => {
    const config = buildMp4Config(30, 22, "/tmp/out.mp4");

    expect(config.outputArgs).toContain("-movflags");
    expect(config.outputArgs[config.outputArgs.indexOf("-movflags") + 1]).toBe(
      "+faststart",
    );
    expect(config.outputArgs[config.outputArgs.indexOf("-crf") + 1]).toBe("22");
    expect(config.outputArgs[config.outputArgs.indexOf("-r") + 1]).toBe("30");
    expect(config.outputArgs[config.outputArgs.length - 1]).toBe("/tmp/out.mp4");
    expect(config.filterComplex).toBe("[0][1]overlay=0:0:shortest=1");
  });
});

describe("buildGifConfig", () => {
  it("builds the palette-based filtergraph scaled to the given width", () => {
    const config = buildGifConfig(480, "/tmp/out.gif");

    expect(config.filterComplex).toContain("fps=15");
    expect(config.filterComplex).toContain("scale=480:-1:flags=lanczos");
    expect(config.filterComplex).toContain("palettegen");
    expect(config.filterComplex).toContain("paletteuse");
    expect(config.outputArgs).toEqual(["-loop", "0", "/tmp/out.gif"]);
  });
});

function makeTimelineData(overrides: Partial<TimelineData> = {}): TimelineData {
  return {
    fps: 30,
    width: 640,
    height: 480,
    zoom: 1,
    theme: {
      cursorSvg: DEFAULT_CURSOR_SVG,
      cursorSize: DEFAULT_CURSOR_SIZE,
      cursorHotspot: "top-left",
      hud: { ...DEFAULT_HUD_THEME },
    },
    frames: [],
    events: [],
    steps: [],
    ...overrides,
  };
}

describe("compose zoom pass", () => {
  it("embeds the provided zoomFilter verbatim in the zoom-pass ffmpeg args", async () => {
    spawnCalls.length = 0;
    const zoomFilter = "zoompan=z='if(lte(zoom,1.0),1.5,zoom)':d=1:s=640x480";

    await compose("/tmp/clean.mp4", makeTimelineData(), "/tmp/out.mp4", {
      zoomFilter,
    });

    const zoomPassCall = spawnCalls.find((args) => args.includes("-vf"));
    expect(zoomPassCall).toBeDefined();
    const vfIndex = zoomPassCall!.indexOf("-vf");
    expect(zoomPassCall![vfIndex + 1]).toBe(zoomFilter);
  });

  it("runs no zoom pass (no -vf) when zoomFilter is not provided", async () => {
    spawnCalls.length = 0;

    await compose("/tmp/clean.mp4", makeTimelineData(), "/tmp/out2.mp4");

    const zoomPassCall = spawnCalls.find((args) => args.includes("-vf"));
    expect(zoomPassCall).toBeUndefined();
  });
});
