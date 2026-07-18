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
  it("embeds the provided zoomFilter verbatim in the merged zoom+HUD pass's filter_complex, with the overlay after it", async () => {
    spawnCalls.length = 0;
    const zoomFilter = "zoompan=z='if(lte(zoom,1.0),1.5,zoom)':d=1:s=640x480";

    await compose("/tmp/clean.mp4", makeTimelineData(), "/tmp/out.mp4", {
      zoomFilter,
    });

    const zoomPassCall = spawnCalls.find((args) => {
      const idx = args.indexOf("-filter_complex");
      return idx !== -1 && args[idx + 1].includes(zoomFilter);
    });
    expect(zoomPassCall).toBeDefined();
    const filterComplex = zoomPassCall![zoomPassCall!.indexOf("-filter_complex") + 1];
    expect(filterComplex.indexOf(zoomFilter)).toBeLessThan(
      filterComplex.indexOf("overlay=0:0"),
    );

    // Only two full encodes for the autozoom mp4 path: the cursor-overlay
    // stage and the merged zoom+HUD stage (no separate zoom-only pass).
    const streamingSpawnCalls = spawnCalls.filter((args) =>
      args.includes("-filter_complex"),
    );
    expect(streamingSpawnCalls).toHaveLength(2);
  });

  it("runs no zoom pass (plain overlay, no zoompan) when zoomFilter is not provided", async () => {
    spawnCalls.length = 0;

    await compose("/tmp/clean.mp4", makeTimelineData(), "/tmp/out2.mp4");

    const zoomPassCall = spawnCalls.find((args) => {
      const idx = args.indexOf("-filter_complex");
      return idx !== -1 && args[idx + 1].includes("zoompan=");
    });
    expect(zoomPassCall).toBeUndefined();
  });

  it("keeps the GIF config (palette conversion) on the merged pass for GIF output", async () => {
    spawnCalls.length = 0;
    const zoomFilter = "zoompan=z='if(lte(zoom,1.0),1.5,zoom)':d=1:s=640x480";

    await compose("/tmp/clean.mp4", makeTimelineData(), "/tmp/out.gif", {
      zoomFilter,
    });

    const gifPassCall = spawnCalls.find((args) => {
      const idx = args.indexOf("-filter_complex");
      return idx !== -1 && args[idx + 1].includes("palettegen");
    });
    expect(gifPassCall).toBeDefined();
    const filterComplex = gifPassCall![gifPassCall!.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain(zoomFilter);
    expect(filterComplex.indexOf(zoomFilter)).toBeLessThan(
      filterComplex.indexOf("overlay=0:0"),
    );
    expect(filterComplex.indexOf("overlay=0:0")).toBeLessThan(
      filterComplex.indexOf("palettegen"),
    );
    expect(gifPassCall).toContain("-loop");

    // Only two full encodes total: the cursor-overlay stage and the merged
    // zoom+HUD+GIF-palette stage (no separate zoom-only pass for GIF either).
    const streamingSpawnCalls = spawnCalls.filter((args) =>
      args.includes("-filter_complex"),
    );
    expect(streamingSpawnCalls).toHaveLength(2);
  });
});

describe("buildZoomHudMp4Config / buildZoomHudGifConfig", () => {
  it("embeds zoompan before the HUD overlay in the mp4 config", async () => {
    const { buildZoomHudMp4Config } = await import("../compositor.js");
    const zoomFilter = "zoompan=z=1.5:d=1:s=640x480";
    const config = buildZoomHudMp4Config(30, 20, zoomFilter, "/tmp/out.mp4");

    expect(config.filterComplex).toBe(
      `[0]${zoomFilter}[zoomed];[zoomed][1]overlay=0:0:shortest=1`,
    );
    expect(config.outputArgs[config.outputArgs.length - 1]).toBe("/tmp/out.mp4");
  });

  it("embeds zoompan, then overlay, then the gif palette filter in the gif config", async () => {
    const { buildZoomHudGifConfig } = await import("../compositor.js");
    const zoomFilter = "zoompan=z=1.5:d=1:s=640x480";
    const config = buildZoomHudGifConfig(480, zoomFilter, "/tmp/out.gif");

    expect(config.filterComplex.indexOf(zoomFilter)).toBeLessThan(
      config.filterComplex.indexOf("overlay=0:0"),
    );
    expect(config.filterComplex.indexOf("overlay=0:0")).toBeLessThan(
      config.filterComplex.indexOf("palettegen"),
    );
    expect(config.outputArgs).toEqual(["-loop", "0", "/tmp/out.gif"]);
  });
});
