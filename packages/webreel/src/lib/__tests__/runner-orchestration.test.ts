import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CDPClient } from "@webreel/core";
import type { VideoConfig } from "../types.js";

// Characterizes runVideo's orchestration of Chrome/CDP/Recorder/compose
// without touching real Chrome or ffmpeg. Only the resource-boundary exports
// (launchChrome, connectCDP, Recorder, compose) are faked; everything else
// from @webreel/core (RecordingContext, navigate, pause, InteractionTimeline,
// etc.) runs for real against the fake CDPClient, mirroring the pattern in
// recorder.test.ts.

const hoisted = vi.hoisted(() => {
  class FakeRecorder {
    static instances: FakeRecorder[] = [];
    static nextTempVideoPath = "";
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    setTimeline = vi.fn();
    getTempVideoPath = vi.fn(() => FakeRecorder.nextTempVideoPath);
    constructor(..._args: unknown[]) {
      FakeRecorder.instances.push(this);
    }
  }

  return {
    FakeRecorder,
    chromeKillMock: vi.fn().mockResolvedValue(undefined),
    launchChromeMock: vi.fn(),
    connectCDPMock: vi.fn(),
    composeMock: vi.fn().mockResolvedValue(undefined),
  };
});

const { FakeRecorder, chromeKillMock, launchChromeMock, connectCDPMock, composeMock } =
  hoisted;

vi.mock("@webreel/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@webreel/core")>();
  return {
    ...actual,
    launchChrome: launchChromeMock,
    connectCDP: connectCDPMock,
    Recorder: FakeRecorder,
    compose: composeMock,
  };
});

const { runVideo } = await import("../runner.js");

const CHROME_PORT = 9909;

function createFakeClient(overrides: Partial<Record<string, unknown>> = {}): CDPClient {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    Page: {
      enable: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
      loadEventFired: vi.fn().mockResolvedValue(undefined),
      captureScreenshot: vi.fn().mockResolvedValue({ data: "" }),
    },
    Runtime: {
      enable: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ result: {} }),
    },
    Input: {
      dispatchMouseEvent: vi.fn().mockResolvedValue(undefined),
      dispatchKeyEvent: vi.fn().mockResolvedValue(undefined),
      insertText: vi.fn().mockResolvedValue(undefined),
    },
    Emulation: {
      setDeviceMetricsOverride: vi.fn().mockResolvedValue(undefined),
    },
    DOM: {
      enable: vi.fn().mockResolvedValue(undefined),
      getDocument: vi.fn().mockResolvedValue({ root: { nodeId: 1 } }),
      querySelector: vi.fn().mockResolvedValue({ nodeId: 1 }),
      setFileInputFiles: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as CDPClient;
}

let fakeClient: CDPClient;
let configDir: string;
let tempVideoDir: string;

beforeEach(() => {
  fakeClient = createFakeClient();
  connectCDPMock.mockReset();
  connectCDPMock.mockImplementation(async () => fakeClient);
  launchChromeMock.mockReset();
  launchChromeMock.mockResolvedValue({
    port: CHROME_PORT,
    kill: chromeKillMock,
    process: {},
  });
  chromeKillMock.mockClear();
  composeMock.mockClear();
  FakeRecorder.instances.length = 0;

  configDir = mkdtempSync(join(tmpdir(), "webreel-runner-orch-config-"));
  tempVideoDir = mkdtempSync(join(tmpdir(), "webreel-runner-orch-video-"));
  const tempVideoPath = join(tempVideoDir, "clean.mp4");
  writeFileSync(tempVideoPath, "fake-video-bytes");
  FakeRecorder.nextTempVideoPath = tempVideoPath;
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
  rmSync(tempVideoDir, { recursive: true, force: true });
});

function minimalConfig(overrides: Partial<VideoConfig> = {}): VideoConfig {
  return {
    name: "characterization",
    url: "http://localhost/x",
    viewport: { width: 400, height: 300 },
    thumbnail: { enabled: false },
    steps: [{ action: "pause", ms: 1 }],
    ...overrides,
  };
}

describe("runVideo orchestration (happy path)", () => {
  it("launches Chrome, connects CDP, sets the viewport, and records around the steps", async () => {
    const config = minimalConfig();

    await runVideo(config, { record: true, configDir });

    expect(launchChromeMock).toHaveBeenCalledTimes(1);
    expect(connectCDPMock).toHaveBeenCalledWith(CHROME_PORT);

    expect(fakeClient.Emulation.setDeviceMetricsOverride).toHaveBeenCalledWith({
      width: 400,
      height: 300,
      deviceScaleFactor: 1,
      mobile: false,
    });

    expect(FakeRecorder.instances).toHaveLength(1);
    const instance = FakeRecorder.instances[0];
    expect(instance.start).toHaveBeenCalledTimes(1);
    expect(instance.stop).toHaveBeenCalledTimes(1);
    // start must precede stop -- the step loop runs strictly between them.
    expect(instance.start.mock.invocationCallOrder[0]).toBeLessThan(
      instance.stop.mock.invocationCallOrder[0],
    );

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(chromeKillMock).toHaveBeenCalledTimes(1);
    expect(fakeClient.close).toHaveBeenCalledTimes(1);
  });

  it("does not flake across repeated runs", async () => {
    for (let i = 0; i < 5; i++) {
      FakeRecorder.instances.length = 0;
      chromeKillMock.mockClear();
      composeMock.mockClear();
      const localConfigDir = mkdtempSync(join(tmpdir(), "webreel-runner-orch-loop-"));
      const localVideoDir = mkdtempSync(join(tmpdir(), "webreel-runner-orch-loopvid-"));
      const tempVideoPath = join(localVideoDir, "clean.mp4");
      writeFileSync(tempVideoPath, "fake-video-bytes");
      FakeRecorder.nextTempVideoPath = tempVideoPath;

      await runVideo(minimalConfig(), { record: true, configDir: localConfigDir });

      expect(FakeRecorder.instances[0].start).toHaveBeenCalledTimes(1);
      expect(FakeRecorder.instances[0].stop).toHaveBeenCalledTimes(1);
      expect(chromeKillMock).toHaveBeenCalledTimes(1);

      rmSync(localConfigDir, { recursive: true, force: true });
      rmSync(localVideoDir, { recursive: true, force: true });
    }
  });
});

describe("runVideo orchestration (failure cleanup)", () => {
  it("still stops the recorder and kills Chrome when a step throws", async () => {
    fakeClient.Runtime.evaluate = vi
      .fn()
      .mockRejectedValue(new Error("cdp connection lost"));

    const config = minimalConfig({
      steps: [{ action: "click", selector: "#does-not-exist" }],
    });

    await expect(runVideo(config, { record: true, configDir })).rejects.toThrow(
      /Step 0 \(click\) failed/,
    );

    expect(FakeRecorder.instances).toHaveLength(1);
    const instance = FakeRecorder.instances[0];
    expect(instance.stop).toHaveBeenCalledTimes(1);
    expect(chromeKillMock).toHaveBeenCalledTimes(1);
    expect(fakeClient.close).toHaveBeenCalledTimes(1);
  });
});
