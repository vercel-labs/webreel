import { describe, it, expect } from "vitest";
import {
  validateWebreelConfig,
  loadWebreelConfig,
  parseSchemaVersion,
  resolveConfigPath,
  formatValidationErrors,
  buildLineMap,
  getConfigDir,
  filterVideosByName,
  type ValidationError,
} from "../config.js";
import type { VideoConfig } from "../types.js";
import { writeFileSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

describe("validateWebreelConfig videos", () => {
  function wrapVideo(video: Record<string, unknown>) {
    return { videos: { x: video } };
  }

  it("requires video url", () => {
    const errors = validateWebreelConfig(wrapVideo({ steps: [] }));
    expect(errors).toContainEqual(expect.objectContaining({ path: "videos.x.url" }));
  });

  it("requires steps to be an array", () => {
    const errors = validateWebreelConfig(wrapVideo({ url: "u", steps: "bad" }));
    expect(errors).toContainEqual(expect.objectContaining({ path: "videos.x.steps" }));
  });

  it("validates video viewport dimensions", () => {
    const errors = validateWebreelConfig(
      wrapVideo({
        url: "u",
        viewport: { width: -1, height: 0 },
        steps: [],
      }),
    );
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.viewport.width" }),
    );
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.viewport.height" }),
    );
  });
});

describe("validateStep", () => {
  function validate(step: unknown) {
    return validateWebreelConfig({
      videos: { x: { url: "u", steps: [step] } },
    });
  }

  it("rejects unknown action", () => {
    const errors = validate({ action: "fly" });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].action" }),
    );
  });

  it("rejects non-object step", () => {
    const errors = validate("bad");
    expect(errors).toContainEqual(expect.objectContaining({ path: "videos.x.steps[0]" }));
  });

  it("validates pause requires ms", () => {
    const errors = validate({ action: "pause" });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].ms" }),
    );
  });

  it("validates pause rejects negative ms", () => {
    const errors = validate({ action: "pause", ms: -1 });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].ms" }),
    );
  });

  it("validates click requires text or selector", () => {
    const errors = validate({ action: "click" });
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "videos.x.steps[0]",
        message: expect.stringContaining("text"),
      }),
    );
  });

  it("validates key requires non-empty key", () => {
    const errors = validate({ action: "key", key: "" });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].key" }),
    );
  });

  it("validates drag from requires text or selector", () => {
    const errors = validate({
      action: "drag",
      from: {},
      to: { text: "x" },
    });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].from" }),
    );
  });

  it("validates drag to requires text or selector", () => {
    const errors = validate({
      action: "drag",
      from: { text: "x" },
      to: {},
    });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].to" }),
    );
  });

  it("validates moveTo requires text or selector", () => {
    const errors = validate({ action: "moveTo" });
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "videos.x.steps[0]",
        message: expect.stringContaining("text"),
      }),
    );
  });

  it("validates type requires non-empty text", () => {
    const errors = validate({ action: "type", text: "" });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].text" }),
    );
  });

  it("validates type rejects missing text", () => {
    const errors = validate({ action: "type" });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].text" }),
    );
  });

  it("validates scroll x must be a number", () => {
    const errors = validate({ action: "scroll", x: "bad" });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].x" }),
    );
  });

  it("validates wait requires selector or text", () => {
    const errors = validate({ action: "wait" });
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "videos.x.steps[0]",
        message: expect.stringContaining("selector"),
      }),
    );
  });

  it("accepts valid wait with text", () => {
    const errors = validate({ action: "wait", text: "loaded" });
    expect(errors).toEqual([]);
  });

  it("accepts valid wait with selector", () => {
    const errors = validate({ action: "wait", selector: ".ready" });
    expect(errors).toEqual([]);
  });

  it("accepts valid scroll with no args", () => {
    const errors = validate({ action: "scroll" });
    expect(errors).toEqual([]);
  });

  it("validates screenshot requires non-empty output", () => {
    const errors = validate({ action: "screenshot", output: "" });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].output" }),
    );
  });

  it("validates screenshot rejects missing output", () => {
    const errors = validate({ action: "screenshot" });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].output" }),
    );
  });

  it("accepts valid screenshot", () => {
    const errors = validate({ action: "screenshot", output: "hero.png" });
    expect(errors).toEqual([]);
  });

  it("accepts description field on any step", () => {
    const errors = validate({
      action: "pause",
      ms: 500,
      description: "wait for animation",
    });
    expect(errors).toEqual([]);
  });

  it("rejects non-string description", () => {
    const errors = validate({ action: "pause", ms: 500, description: 123 });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].description" }),
    );
  });
});

describe("unknown property detection", () => {
  function validate(step: unknown) {
    return validateWebreelConfig({
      videos: { x: { url: "u", steps: [step] } },
    });
  }

  it("detects unknown step properties with suggestions", () => {
    const errors = validate({ action: "click", text: "Go", seletor: ".btn" });
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "videos.x.steps[0].seletor",
        message: expect.stringContaining("did you mean"),
      }),
    );
  });

  it("detects unknown top-level properties", () => {
    const errors = validateWebreelConfig({
      vidos: {},
      videos: { x: { url: "u", steps: [] } },
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: ".vidos",
        message: expect.stringContaining("did you mean"),
      }),
    );
  });

  it("detects unknown video properties", () => {
    const errors = validateWebreelConfig({
      videos: { x: { url: "u", steps: [], viewprot: { width: 1920, height: 1080 } } },
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "videos.x.viewprot",
        message: expect.stringContaining("Unknown property"),
      }),
    );
  });
});

describe("include validation", () => {
  it("rejects non-array include at top level", () => {
    const errors = validateWebreelConfig({
      include: "bad",
      videos: { x: { url: "u", steps: [] } },
    });
    expect(errors).toContainEqual(expect.objectContaining({ path: "include" }));
  });

  it("rejects non-array include at video level", () => {
    const errors = validateWebreelConfig({
      videos: { x: { url: "u", steps: [], include: "bad" } },
    });
    expect(errors).toContainEqual(expect.objectContaining({ path: "videos.x.include" }));
  });

  it("rejects empty string in include array", () => {
    const errors = validateWebreelConfig({
      videos: { x: { url: "u", steps: [], include: [""] } },
    });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.include[0]" }),
    );
  });
});

describe("validateWebreelConfig", () => {
  it("accepts a valid multi-video config", () => {
    const errors = validateWebreelConfig({
      videos: {
        hero: {
          url: "https://example.com",
          steps: [{ action: "pause", ms: 500 }],
        },
        login: {
          url: "https://example.com/login",
          steps: [{ action: "click", text: "Sign In" }],
        },
      },
    });
    expect(errors).toEqual([]);
  });

  it("accepts config with $schema and top-level defaults", () => {
    const errors = validateWebreelConfig({
      $schema: "https://webreel.dev/schema/v1.json",
      outDir: "./videos",
      baseUrl: "https://myapp.com",
      viewport: { width: 1920, height: 1080 },
      videos: {
        hero: {
          url: "/",
          steps: [],
        },
      },
    });
    expect(errors).toEqual([]);
  });

  it("rejects non-object config", () => {
    const errors = validateWebreelConfig("bad");
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "",
        message: expect.stringContaining("object"),
      }),
    );
  });

  it("requires videos object", () => {
    const errors = validateWebreelConfig({});
    expect(errors).toContainEqual(expect.objectContaining({ path: "videos" }));
  });

  it("rejects empty videos object", () => {
    const errors = validateWebreelConfig({ videos: {} });
    expect(errors).toContainEqual(expect.objectContaining({ path: "videos" }));
  });

  it("rejects videos as array", () => {
    const errors = validateWebreelConfig({ videos: [] });
    expect(errors).toContainEqual(expect.objectContaining({ path: "videos" }));
  });

  it("validates video url and steps", () => {
    const errors = validateWebreelConfig({
      videos: { x: {} },
    });
    expect(errors).toContainEqual(expect.objectContaining({ path: "videos.x.url" }));
    expect(errors).toContainEqual(expect.objectContaining({ path: "videos.x.steps" }));
  });

  it("validates video steps", () => {
    const errors = validateWebreelConfig({
      videos: {
        x: {
          url: "u",
          steps: [{ action: "pause" }],
        },
      },
    });
    expect(errors).toContainEqual(
      expect.objectContaining({ path: "videos.x.steps[0].ms" }),
    );
  });

  it("validates top-level viewport", () => {
    const errors = validateWebreelConfig({
      viewport: { width: -1, height: 0 },
      videos: { x: { url: "u", steps: [] } },
    });
    expect(errors).toContainEqual(expect.objectContaining({ path: "viewport.width" }));
    expect(errors).toContainEqual(expect.objectContaining({ path: "viewport.height" }));
  });

  it("validates top-level outDir", () => {
    const errors = validateWebreelConfig({
      outDir: "",
      videos: { x: { url: "u", steps: [] } },
    });
    expect(errors).toContainEqual(expect.objectContaining({ path: "outDir" }));
  });

  it("validates top-level include", () => {
    const errors = validateWebreelConfig({
      include: "bad",
      videos: { x: { url: "u", steps: [] } },
    });
    expect(errors).toContainEqual(expect.objectContaining({ path: "include" }));
  });
});

describe("loadWebreelConfig", () => {
  const dir = resolve(tmpdir(), `webreel-cfg-test-${Date.now()}`);

  function cleanup() {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  it("loads a config with videos object", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          $schema: "https://webreel.dev/schema/v1.json",
          videos: {
            hero: {
              url: "https://example.com",
              steps: [{ action: "pause", ms: 500 }],
            },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "webreel.config.json"));
      expect(config.videos).toHaveLength(1);
      expect(config.videos[0].name).toBe("hero");
    } finally {
      cleanup();
    }
  });

  it("inherits top-level defaults into videos", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          baseUrl: "https://myapp.com",
          viewport: { width: 1920, height: 1080 },
          videos: {
            hero: {
              url: "/",
              steps: [],
            },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "webreel.config.json"));
      expect(config.videos[0].baseUrl).toBe("https://myapp.com");
      expect(config.videos[0].viewport).toEqual({ width: 1920, height: 1080 });
    } finally {
      cleanup();
    }
  });

  it("video-level values override top-level defaults", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          baseUrl: "https://default.com",
          viewport: { width: 1920, height: 1080 },
          videos: {
            hero: {
              url: "/",
              baseUrl: "https://override.com",
              viewport: { width: 800, height: 600 },
              steps: [],
            },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "webreel.config.json"));
      expect(config.videos[0].baseUrl).toBe("https://override.com");
      expect(config.videos[0].viewport).toEqual({ width: 800, height: 600 });
    } finally {
      cleanup();
    }
  });

  it("rejects config without videos object", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "invalid.json"),
        JSON.stringify({
          url: "https://example.com",
          steps: [{ action: "pause", ms: 100 }],
        }),
      );
      await expect(loadWebreelConfig(resolve(dir, "invalid.json"))).rejects.toThrow(
        "Invalid config",
      );
    } finally {
      cleanup();
    }
  });

  it("defaults outDir to videos/", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          videos: {
            hero: {
              url: "https://example.com",
              steps: [],
            },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "webreel.config.json"));
      expect(config.videos[0].output).toBe(resolve(dir, "videos", "hero.mp4"));
    } finally {
      cleanup();
    }
  });

  it("resolves explicit outDir for video outputs", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          outDir: "./dist",
          videos: {
            hero: {
              url: "https://example.com",
              steps: [],
            },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "webreel.config.json"));
      expect(config.videos[0].output).toBe(resolve(dir, "dist", "hero.mp4"));
    } finally {
      cleanup();
    }
  });
});

describe("resolveConfigPath", () => {
  const dir = resolve(tmpdir(), `webreel-resolve-test-${Date.now()}`);

  function cleanup() {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  it("finds webreel.config.json in parent directory", () => {
    const child = resolve(dir, "sub", "child");
    mkdirSync(child, { recursive: true });
    const realDir = realpathSync(dir);
    writeFileSync(resolve(realDir, "webreel.config.json"), "{}");
    try {
      const origCwd = process.cwd();
      process.chdir(child);
      try {
        const found = resolveConfigPath();
        expect(found).toBe(resolve(realDir, "webreel.config.json"));
      } finally {
        process.chdir(origCwd);
      }
    } finally {
      cleanup();
    }
  });

  it("prefers .json over .ts when both exist in same dir", () => {
    mkdirSync(dir, { recursive: true });
    const realDir = realpathSync(dir);
    writeFileSync(resolve(realDir, "webreel.config.json"), "{}");
    writeFileSync(resolve(realDir, "webreel.config.ts"), "export default {}");
    try {
      const origCwd = process.cwd();
      process.chdir(realDir);
      try {
        const found = resolveConfigPath();
        expect(found).toBe(resolve(realDir, "webreel.config.json"));
      } finally {
        process.chdir(origCwd);
      }
    } finally {
      cleanup();
    }
  });
});

describe("parseSchemaVersion", () => {
  it("returns 1 for undefined", () => {
    expect(parseSchemaVersion(undefined)).toBe(1);
  });

  it("returns -1 for unversioned URL", () => {
    expect(parseSchemaVersion("https://webreel.dev/schema.json")).toBe(-1);
  });

  it("returns 1 for versioned v1 URL", () => {
    expect(parseSchemaVersion("https://webreel.dev/schema/v1.json")).toBe(1);
  });

  it("returns 2 for versioned v2 URL", () => {
    expect(parseSchemaVersion("https://webreel.dev/schema/v2.json")).toBe(2);
  });

  it("returns -1 for unknown URL format", () => {
    expect(parseSchemaVersion("https://example.com/something.json")).toBe(-1);
  });
});

describe("validateWebreelConfig with version", () => {
  it("rejects unsupported schema versions", () => {
    const errors = validateWebreelConfig({}, 99);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe("$schema");
    expect(errors[0].message).toContain("Unsupported schema version");
  });

  it("validates v1 normally", () => {
    const errors = validateWebreelConfig(
      {
        videos: {
          test: { url: "https://example.com", steps: [] },
        },
      },
      1,
    );
    expect(errors).toHaveLength(0);
  });
});

describe("formatValidationErrors", () => {
  it("formats errors with file path and messages", () => {
    const errors: ValidationError[] = [
      { path: "videos.hero.url", message: "Required" },
      { path: "videos.hero.steps", message: "Must be an array" },
    ];
    const result = formatValidationErrors("webreel.config.json", errors);
    expect(result).toContain("webreel.config.json");
    expect(result).toContain("Required");
    expect(result).toContain("Must be an array");
  });

  it("includes line numbers when lineMap is provided", () => {
    const raw = JSON.stringify({ videos: { hero: { url: "u", steps: "bad" } } }, null, 2);
    const lineMap = buildLineMap(raw);
    const errors: ValidationError[] = [
      { path: "videos.hero.steps", message: "Must be an array" },
    ];
    const result = formatValidationErrors("test.json", errors, lineMap);
    expect(result).toMatch(/L\d+/);
  });
});

describe("getConfigDir", () => {
  it("returns the directory containing the config file", () => {
    const dir = getConfigDir("/home/user/project/webreel.config.json");
    expect(dir).toBe(resolve("/home/user/project"));
  });

  it("handles relative paths", () => {
    const dir = getConfigDir("configs/webreel.config.json");
    expect(dir).toBe(resolve("configs"));
  });
});

describe("filterVideosByName", () => {
  const videos = [
    { name: "hero" },
    { name: "login" },
    { name: "dashboard" },
  ] as VideoConfig[];

  it("returns all videos when names is empty", () => {
    const result = filterVideosByName(videos, []);
    expect(result).toEqual(videos);
  });

  it("filters to matching videos", () => {
    const result = filterVideosByName(videos, ["hero", "login"]);
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.name)).toEqual(["hero", "login"]);
  });

  it("throws when a name is not found", () => {
    expect(() => filterVideosByName(videos, ["hero", "missing"])).toThrow(
      "Video(s) not found: missing",
    );
  });
});

describe("loadWebreelConfig with env substitution", () => {
  const dir = resolve(tmpdir(), `webreel-env-test-${Date.now()}`);

  function cleanup() {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  it("substitutes $VAR and ${VAR} in JSON config", async () => {
    const originalBase = process.env.BASE_URL;
    process.env.BASE_URL = "https://envtest.com";
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          videos: {
            hero: {
              url: "$BASE_URL",
              steps: [],
            },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "webreel.config.json"));
      expect(config.videos[0].url).toBe("https://envtest.com");
    } finally {
      if (originalBase !== undefined) {
        process.env.BASE_URL = originalBase;
      } else {
        delete process.env.BASE_URL;
      }
      cleanup();
    }
  });
});
