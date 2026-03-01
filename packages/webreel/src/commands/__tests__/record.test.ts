import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { collectIncludePaths } from "../record.js";
import type { WebreelConfig } from "../../lib/types.js";

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
