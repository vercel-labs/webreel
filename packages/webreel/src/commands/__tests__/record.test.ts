import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { collectIncludePaths } from "../record.js";
import type { FullConfig, VideoConfig } from "../../lib/types.js";

describe("collectIncludePaths", () => {
  const configDir = "/project";

  function makeFull(videos: Partial<VideoConfig>[]): FullConfig {
    return {
      videos: videos.map((v, i) => ({
        name: `v${i}`,
        configDir,
        url: "https://example.com",
        steps: [],
        ...v,
      })) as VideoConfig[],
      videoSources: new Map(),
    };
  }

  it("returns empty array when no includes exist", () => {
    const full = makeFull([{}]);
    expect(collectIncludePaths(full)).toEqual([]);
  });

  it("resolves per-video include paths relative to video configDir", () => {
    const full = makeFull([{ include: ["steps/setup.json"] }]);
    const result = collectIncludePaths(full);
    expect(result).toEqual([resolve(configDir, "steps/setup.json")]);
  });

  it("combines includes from multiple videos", () => {
    const full = makeFull([
      { include: ["steps/v1.json"] },
      { include: ["steps/v2.json"] },
    ]);
    const result = collectIncludePaths(full);
    expect(result).toEqual([
      resolve(configDir, "steps/v1.json"),
      resolve(configDir, "steps/v2.json"),
    ]);
  });

  it("deduplicates identical paths", () => {
    const full = makeFull([
      { include: ["steps/setup.json"] },
      { include: ["steps/setup.json"] },
    ]);
    const result = collectIncludePaths(full);
    expect(result).toEqual([resolve(configDir, "steps/setup.json")]);
  });

  it("uses different configDir per video", () => {
    const full: FullConfig = {
      videos: [
        {
          name: "a",
          configDir: "/projectA",
          url: "https://example.com",
          steps: [],
          include: ["steps/a.json"],
        } as VideoConfig,
        {
          name: "b",
          configDir: "/projectB",
          url: "https://example.com",
          steps: [],
          include: ["steps/b.json"],
        } as VideoConfig,
      ],
      videoSources: new Map(),
    };
    const result = collectIncludePaths(full);
    expect(result).toEqual([
      resolve("/projectA", "steps/a.json"),
      resolve("/projectB", "steps/b.json"),
    ]);
  });
});
