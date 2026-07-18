import { describe, it, expect, vi, afterEach } from "vitest";
import type { TimelineData } from "@webreel/core";

vi.mock("@webreel/core", async () => {
  const actual = await vi.importActual<typeof import("@webreel/core")>("@webreel/core");
  return {
    ...actual,
    compose: vi.fn(),
    buildAutoZoomFilter: vi.fn(),
    ensureFfmpeg: vi.fn(),
    extractThumbnail: vi.fn(),
  };
});

import {
  compose,
  buildAutoZoomFilter,
  ensureFfmpeg,
  extractThumbnail,
} from "@webreel/core";
import {
  compositeRecording,
  extractThumbnailIfConfigured,
  normalizeAutoZoom,
} from "../compositing.js";

const mockedCompose = vi.mocked(compose);
const mockedBuildAutoZoomFilter = vi.mocked(buildAutoZoomFilter);
const mockedEnsureFfmpeg = vi.mocked(ensureFfmpeg);
const mockedExtractThumbnail = vi.mocked(extractThumbnail);

const timelineData: TimelineData = {
  fps: 30,
  width: 1920,
  height: 1080,
  zoom: 1,
  frames: [],
  events: [],
  steps: [],
  theme: { cursorSvg: "<svg/>", cursorSize: 24 },
} as unknown as TimelineData;

describe("normalizeAutoZoom", () => {
  it("returns enabled:true for boolean true", () => {
    expect(normalizeAutoZoom(true)).toEqual({ enabled: true });
  });

  it("returns enabled:false for boolean false", () => {
    expect(normalizeAutoZoom(false)).toEqual({ enabled: false });
  });

  it("returns enabled:false for undefined", () => {
    expect(normalizeAutoZoom(undefined)).toEqual({ enabled: false });
  });

  it("defaults enabled to true for an object without it (e.g. from parsed JSON config)", () => {
    // AutoZoomConfig.enabled is typed as required, but real config files
    // loaded via JSON.parse aren't checked against that at runtime, so
    // normalizeAutoZoom must tolerate a missing `enabled` field.
    const looselyTyped = { approachS: 1 } as unknown as { enabled: boolean };
    expect(normalizeAutoZoom(looselyTyped)).toEqual({ enabled: true, approachS: 1 });
  });

  it("preserves an explicit enabled:false in an object", () => {
    expect(normalizeAutoZoom({ enabled: false, approachS: 1 })).toEqual({
      enabled: false,
      approachS: 1,
    });
  });
});

describe("compositeRecording", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls compose with zoomFilter: undefined when autoZoom is disabled", async () => {
    mockedEnsureFfmpeg.mockResolvedValue("/bin/ffmpeg");
    await compositeRecording({
      rawVideoPath: "/raw/video.mp4",
      timelineData,
      outputPath: "/out/video.mp4",
      video: { autoZoom: false },
      zoomEvents: [],
      verbose: false,
    });

    expect(mockedBuildAutoZoomFilter).not.toHaveBeenCalled();
    expect(mockedCompose).toHaveBeenCalledTimes(1);
    expect(mockedCompose).toHaveBeenCalledWith(
      "/raw/video.mp4",
      timelineData,
      "/out/video.mp4",
      expect.objectContaining({ zoomFilter: undefined }),
    );
  });

  it("passes a built filter string to compose when enabled and events exist, then extracts the thumbnail after compose", async () => {
    mockedBuildAutoZoomFilter.mockReturnValue("zoompan=z='1'");
    mockedEnsureFfmpeg.mockResolvedValue("/bin/ffmpeg");
    const calls: string[] = [];
    mockedCompose.mockImplementation(async () => {
      calls.push("compose");
    });
    mockedExtractThumbnail.mockImplementation(() => {
      calls.push("thumbnail");
    });

    const zoomEvents = [{ timeMs: 1000, box: { x: 0, y: 0, width: 100, height: 100 } }];

    await compositeRecording({
      rawVideoPath: "/raw/video.mp4",
      timelineData,
      outputPath: "/out/video.mp4",
      video: { autoZoom: true },
      zoomEvents,
      verbose: false,
    });

    expect(mockedBuildAutoZoomFilter).toHaveBeenCalledWith(
      zoomEvents,
      { width: timelineData.width, height: timelineData.height },
      timelineData.zoom,
      timelineData.fps,
      { enabled: true },
    );
    expect(mockedCompose).toHaveBeenCalledWith(
      "/raw/video.mp4",
      timelineData,
      "/out/video.mp4",
      expect.objectContaining({ zoomFilter: "zoompan=z='1'" }),
    );
    expect(mockedExtractThumbnail).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["compose", "thumbnail"]);
  });

  it("skips extractThumbnail work when thumbnail.enabled is false", async () => {
    mockedEnsureFfmpeg.mockResolvedValue("/bin/ffmpeg");
    await compositeRecording({
      rawVideoPath: "/raw/video.mp4",
      timelineData,
      outputPath: "/out/video.mp4",
      video: { autoZoom: false, thumbnail: { enabled: false } },
      zoomEvents: [],
      verbose: false,
    });

    expect(mockedEnsureFfmpeg).not.toHaveBeenCalled();
    expect(mockedExtractThumbnail).not.toHaveBeenCalled();
  });
});

describe("extractThumbnailIfConfigured", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when thumbnail.enabled is false", async () => {
    await extractThumbnailIfConfigured(
      { thumbnail: { enabled: false } },
      "/out/video.mp4",
    );
    expect(mockedEnsureFfmpeg).not.toHaveBeenCalled();
    expect(mockedExtractThumbnail).not.toHaveBeenCalled();
  });

  it("extracts a thumbnail at the configured time, deriving a .png path", async () => {
    mockedEnsureFfmpeg.mockResolvedValue("/bin/ffmpeg");
    await extractThumbnailIfConfigured({ thumbnail: { time: 2.5 } }, "/out/video.mp4");
    expect(mockedExtractThumbnail).toHaveBeenCalledWith(
      "/bin/ffmpeg",
      "/out/video.mp4",
      "/out/video.png",
      2.5,
    );
  });

  it("defaults the thumbnail time to 0 when unset", async () => {
    mockedEnsureFfmpeg.mockResolvedValue("/bin/ffmpeg");
    await extractThumbnailIfConfigured({}, "/out/video.mp4");
    expect(mockedExtractThumbnail).toHaveBeenCalledWith(
      "/bin/ffmpeg",
      "/out/video.mp4",
      "/out/video.png",
      0,
    );
  });
});
