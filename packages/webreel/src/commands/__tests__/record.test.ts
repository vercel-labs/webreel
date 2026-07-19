import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { collectIncludePaths } from "../record.js";
import type { WebreelConfig } from "../../lib/types.js";

vi.mock("../../lib/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/config.js")>();
  return {
    ...actual,
    resolveConfigPath: vi.fn(() => "/fake/webreel.config.json"),
    loadWebreelConfig: vi.fn(),
  };
});

vi.mock("../../lib/runner.js", () => ({
  runVideo: vi.fn(),
}));

vi.mock("../../lib/signals.js", () => ({
  installSignalHandlers: vi.fn(() => vi.fn()),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    watch: vi.fn(),
  };
});

describe("collectIncludePaths", () => {
  const configPath = "/project/webreel.config.json";
  const configDir = dirname(configPath);

  function makeConfig(overrides: Partial<WebreelConfig> = {}): WebreelConfig {
    return {
      videos: [
        {
          name: "test",
          url: "https://example.com",
          steps: [],
        },
      ],
      ...overrides,
    };
  }

  it("returns empty array when no includes exist", () => {
    const config = makeConfig();
    expect(collectIncludePaths(config, configPath)).toEqual([]);
  });

  it("resolves top-level include paths relative to config dir", () => {
    const config = makeConfig({ include: ["steps/setup.json"] });
    const result = collectIncludePaths(config, configPath);
    expect(result).toEqual([resolve(configDir, "steps/setup.json")]);
  });

  it("resolves per-video include paths", () => {
    const config = makeConfig({
      videos: [
        {
          name: "v1",
          url: "https://example.com",
          steps: [],
          include: ["steps/v1-setup.json"],
        },
      ],
    });
    const result = collectIncludePaths(config, configPath);
    expect(result).toEqual([resolve(configDir, "steps/v1-setup.json")]);
  });

  it("combines top-level and per-video includes", () => {
    const config = makeConfig({
      include: ["steps/shared.json"],
      videos: [
        {
          name: "v1",
          url: "https://example.com",
          steps: [],
          include: ["steps/v1.json"],
        },
        {
          name: "v2",
          url: "https://example.com",
          steps: [],
          include: ["steps/v2.json"],
        },
      ],
    });
    const result = collectIncludePaths(config, configPath);
    expect(result).toEqual([
      resolve(configDir, "steps/shared.json"),
      resolve(configDir, "steps/v1.json"),
      resolve(configDir, "steps/v2.json"),
    ]);
  });

  it("deduplicates identical paths", () => {
    const config = makeConfig({
      include: ["steps/setup.json"],
      videos: [
        {
          name: "v1",
          url: "https://example.com",
          steps: [],
          include: ["steps/setup.json"],
        },
        {
          name: "v2",
          url: "https://example.com",
          steps: [],
          include: ["steps/setup.json"],
        },
      ],
    });
    const result = collectIncludePaths(config, configPath);
    expect(result).toEqual([resolve(configDir, "steps/setup.json")]);
  });
});

describe("watch mode re-record serialization", () => {
  function makeWatchConfig(): WebreelConfig {
    return {
      videos: [{ name: "test", url: "https://example.com", steps: [] }],
    };
  }

  let onFileChange: (() => void) | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    onFileChange = undefined;

    const { watch } = await import("node:fs");
    vi.mocked(watch).mockImplementation(((_path: unknown, cb: () => void) => {
      onFileChange = cb;
      return { close: vi.fn() } as unknown as ReturnType<typeof watch>;
    }) as typeof watch);

    const { loadWebreelConfig } = await import("../../lib/config.js");
    vi.mocked(loadWebreelConfig).mockResolvedValue(makeWatchConfig());

    const { runVideo } = await import("../../lib/runner.js");
    vi.mocked(runVideo).mockReset();
    vi.mocked(runVideo).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function startWatch() {
    const { recordCommand } = await import("../record.js");
    const runPromise = recordCommand.parseAsync(["--watch"], { from: "user" });
    await runPromise;
    if (!onFileChange) throw new Error("onFileChange was never captured by watch()");
    return onFileChange;
  }

  it("does not start a second run while one is in-flight (no overlap)", async () => {
    const { runVideo } = await import("../../lib/runner.js");
    const change = await startWatch();
    // startWatch() already triggers one runVideo call for the initial
    // (pre-watch) recording pass; count re-record calls relative to that.
    const callsBefore = vi.mocked(runVideo).mock.calls.length;

    let resolveSlowRun: (() => void) | undefined;
    vi.mocked(runVideo).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSlowRun = resolve;
        }),
    );

    change(); // triggers the first re-record
    await vi.advanceTimersByTimeAsync(300);
    expect(runVideo).toHaveBeenCalledTimes(callsBefore + 1); // only the queued re-record started

    // A second change arrives mid-run.
    change();
    await vi.advanceTimersByTimeAsync(300);
    expect(runVideo).toHaveBeenCalledTimes(callsBefore + 1); // still just the one in-flight run

    resolveSlowRun?.();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("queues exactly one rerun for N>1 changes during a run", async () => {
    const { runVideo } = await import("../../lib/runner.js");
    const change = await startWatch();
    const callsBefore = vi.mocked(runVideo).mock.calls.length;

    let resolveSlowRun: (() => void) | undefined;
    vi.mocked(runVideo).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSlowRun = resolve;
        }),
    );

    change();
    await vi.advanceTimersByTimeAsync(300);
    expect(runVideo).toHaveBeenCalledTimes(callsBefore + 1);

    // Three more changes arrive while the run is in-flight.
    change();
    await vi.advanceTimersByTimeAsync(300);
    change();
    await vi.advanceTimersByTimeAsync(300);
    change();
    await vi.advanceTimersByTimeAsync(300);
    expect(runVideo).toHaveBeenCalledTimes(callsBefore + 1); // still no overlap

    // Once the in-flight run resolves, the queued rerun starts exactly once.
    vi.mocked(runVideo).mockResolvedValue(undefined);
    resolveSlowRun?.();
    await vi.advanceTimersByTimeAsync(0); // let the finally block's onFileChange() schedule
    await vi.advanceTimersByTimeAsync(300); // let the follow-up debounce fire

    expect(runVideo).toHaveBeenCalledTimes(callsBefore + 2);

    // Further timer advances shouldn't start additional runs.
    await vi.advanceTimersByTimeAsync(1000);
    expect(runVideo).toHaveBeenCalledTimes(callsBefore + 2);
  });

  it("reloads config for the queued rerun", async () => {
    const { loadWebreelConfig } = await import("../../lib/config.js");
    const { runVideo } = await import("../../lib/runner.js");
    const change = await startWatch();

    const loadCallsBefore = vi.mocked(loadWebreelConfig).mock.calls.length;
    const runCallsBefore = vi.mocked(runVideo).mock.calls.length;

    let resolveSlowRun: (() => void) | undefined;
    vi.mocked(runVideo).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSlowRun = resolve;
        }),
    );

    change();
    await vi.advanceTimersByTimeAsync(300);
    expect(loadWebreelConfig).toHaveBeenCalledTimes(loadCallsBefore + 1);

    change(); // queued while the first re-record is in-flight
    await vi.advanceTimersByTimeAsync(300);

    vi.mocked(runVideo).mockResolvedValue(undefined);
    resolveSlowRun?.();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(300);

    // The queued rerun must reload config, not reuse the stale closure value.
    expect(loadWebreelConfig).toHaveBeenCalledTimes(loadCallsBefore + 2);
    expect(runVideo).toHaveBeenCalledTimes(runCallsBefore + 2);
  });
});
