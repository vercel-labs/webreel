import { describe, it, expect, vi } from "vitest";
import {
  validateWebreelConfig,
  loadWebreelConfig,
  loadFullConfig,
  resolveConfigPaths,
  parseSchemaVersion,
  resolveConfigPath,
  formatValidationErrors,
  buildLineMap,
  getConfigDir,
  filterVideosByName,
  filterVideosByProject,
  filterVideos,
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

describe("extends resolution", () => {
  const dir = resolve(tmpdir(), `webreel-extends-test-${Date.now()}`);

  function cleanup() {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  it("inherits top-level defaults from base config", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "base.json"),
        JSON.stringify({
          baseUrl: "https://base.com",
          viewport: { width: 1920, height: 1080 },
          defaultDelay: 300,
          videos: {},
        }),
      );
      writeFileSync(
        resolve(dir, "child.json"),
        JSON.stringify({
          extends: "./base.json",
          videos: {
            hero: { url: "/", steps: [] },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "child.json"));
      expect(config.baseUrl).toBe("https://base.com");
      expect(config.viewport).toEqual({ width: 1920, height: 1080 });
      expect(config.defaultDelay).toBe(300);
      expect(config.videos).toHaveLength(1);
      expect(config.videos[0].name).toBe("hero");
    } finally {
      cleanup();
    }
  });

  it("child overrides base top-level values", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "base.json"),
        JSON.stringify({
          baseUrl: "https://base.com",
          defaultDelay: 300,
          videos: {},
        }),
      );
      writeFileSync(
        resolve(dir, "child.json"),
        JSON.stringify({
          extends: "./base.json",
          baseUrl: "https://child.com",
          videos: {
            hero: { url: "/", steps: [] },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "child.json"));
      expect(config.baseUrl).toBe("https://child.com");
      expect(config.defaultDelay).toBe(300);
    } finally {
      cleanup();
    }
  });

  it("inherits videos from base config", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "base.json"),
        JSON.stringify({
          videos: {
            base_video: { url: "https://example.com", steps: [] },
          },
        }),
      );
      writeFileSync(
        resolve(dir, "child.json"),
        JSON.stringify({
          extends: "./base.json",
          videos: {
            child_video: { url: "https://example.com/child", steps: [] },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "child.json"));
      expect(config.videos).toHaveLength(2);
      const names = config.videos.map((v) => v.name).sort();
      expect(names).toEqual(["base_video", "child_video"]);
    } finally {
      cleanup();
    }
  });

  it("child video overrides base video with same name", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "base.json"),
        JSON.stringify({
          videos: {
            hero: { url: "https://base.com", steps: [] },
          },
        }),
      );
      writeFileSync(
        resolve(dir, "child.json"),
        JSON.stringify({
          extends: "./base.json",
          videos: {
            hero: { url: "https://child.com", steps: [] },
          },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "child.json"));
      expect(config.videos).toHaveLength(1);
      expect(config.videos[0].url).toBe("https://child.com");
    } finally {
      cleanup();
    }
  });

  it("supports chained extends (3 levels)", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "grandparent.json"),
        JSON.stringify({
          baseUrl: "https://gp.com",
          videos: {},
        }),
      );
      writeFileSync(
        resolve(dir, "parent.json"),
        JSON.stringify({
          extends: "./grandparent.json",
          defaultDelay: 500,
          videos: {},
        }),
      );
      writeFileSync(
        resolve(dir, "child.json"),
        JSON.stringify({
          extends: "./parent.json",
          videos: { hero: { url: "/", steps: [] } },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "child.json"));
      expect(config.baseUrl).toBe("https://gp.com");
      expect(config.defaultDelay).toBe(500);
    } finally {
      cleanup();
    }
  });

  it("detects circular extends", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "a.json"),
        JSON.stringify({ extends: "./b.json", videos: { x: { url: "u", steps: [] } } }),
      );
      writeFileSync(
        resolve(dir, "b.json"),
        JSON.stringify({ extends: "./a.json", videos: { x: { url: "u", steps: [] } } }),
      );
      await expect(loadWebreelConfig(resolve(dir, "a.json"))).rejects.toThrow("Circular");
    } finally {
      cleanup();
    }
  });

  it("throws on missing extends target", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "child.json"),
        JSON.stringify({
          extends: "./nonexistent.json",
          videos: { x: { url: "u", steps: [] } },
        }),
      );
      await expect(loadWebreelConfig(resolve(dir, "child.json"))).rejects.toThrow(
        "not found",
      );
    } finally {
      cleanup();
    }
  });

  it("rejects extends: true in file-based config", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "child.json"),
        JSON.stringify({
          extends: true,
          videos: { x: { url: "u", steps: [] } },
        }),
      );
      await expect(loadWebreelConfig(resolve(dir, "child.json"))).rejects.toThrow(
        "only valid in inline scenario",
      );
    } finally {
      cleanup();
    }
  });

  it("shallow-merges theme sub-keys", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "base.json"),
        JSON.stringify({
          theme: {
            cursor: { size: 32, hotspot: "top-left" },
            hud: { background: "black" },
          },
          videos: {},
        }),
      );
      writeFileSync(
        resolve(dir, "child.json"),
        JSON.stringify({
          extends: "./base.json",
          theme: {
            cursor: { size: 48 },
            hud: { color: "white" },
          },
          videos: { hero: { url: "/", steps: [] } },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "child.json"));
      expect(config.theme?.cursor).toEqual({ size: 48, hotspot: "top-left" });
      expect(config.theme?.hud).toEqual({ background: "black", color: "white" });
    } finally {
      cleanup();
    }
  });

  it("returned config does not contain extends field", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(resolve(dir, "base.json"), JSON.stringify({ videos: {} }));
      writeFileSync(
        resolve(dir, "child.json"),
        JSON.stringify({
          extends: "./base.json",
          videos: { hero: { url: "/", steps: [] } },
        }),
      );
      const config = await loadWebreelConfig(resolve(dir, "child.json"));
      expect("extends" in config).toBe(false);
    } finally {
      cleanup();
    }
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

describe("scenarios and loadFullConfig", () => {
  const dir = resolve(tmpdir(), `webreel-scenarios-test-${Date.now()}`);

  function cleanup() {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  it("loads config with scenarios glob", async () => {
    const demos = resolve(dir, "demos");
    mkdirSync(demos, { recursive: true });
    try {
      writeFileSync(
        resolve(demos, "login.webreel.json"),
        JSON.stringify({
          videos: { login: { url: "/login", steps: [] } },
        }),
      );
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          scenarios: ["./demos/*.webreel.json"],
          videos: { hero: { url: "/", steps: [] } },
        }),
      );
      const full = await loadFullConfig([resolve(dir, "webreel.config.json")]);
      expect(full.videos).toHaveLength(2);
      const names = full.videos.map((v) => v.name).sort();
      expect(names).toEqual(["hero", "login"]);
      expect(full.videoSources.get("hero")).toContain("webreel.config.json");
      expect(full.videoSources.get("login")).toContain("login.webreel.json");
    } finally {
      cleanup();
    }
  });

  it("loads config with inline scenario extends: true", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          baseUrl: "https://example.com",
          defaultDelay: 400,
          scenarios: [
            {
              extends: true,
              videos: { login: { url: "/login", steps: [] } },
            },
          ],
          videos: { hero: { url: "/", steps: [] } },
        }),
      );
      const full = await loadFullConfig([resolve(dir, "webreel.config.json")]);
      expect(full.videos).toHaveLength(2);
      const login = full.videos.find((v) => v.name === "login")!;
      expect(login.baseUrl).toBe("https://example.com");
      expect(login.defaultDelay).toBe(400);
    } finally {
      cleanup();
    }
  });

  it("loads config with inline scenario standalone", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          baseUrl: "https://root.com",
          scenarios: [
            {
              baseUrl: "https://standalone.com",
              videos: { login: { url: "/login", steps: [] } },
            },
          ],
          videos: { hero: { url: "/", steps: [] } },
        }),
      );
      const full = await loadFullConfig([resolve(dir, "webreel.config.json")]);
      const login = full.videos.find((v) => v.name === "login")!;
      expect(login.baseUrl).toBe("https://standalone.com");
    } finally {
      cleanup();
    }
  });

  it("detects duplicate video names across configs", async () => {
    const demos = resolve(dir, "demos");
    mkdirSync(demos, { recursive: true });
    try {
      writeFileSync(
        resolve(demos, "dup.webreel.json"),
        JSON.stringify({
          videos: { hero: { url: "/dup", steps: [] } },
        }),
      );
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          scenarios: ["./demos/*.webreel.json"],
          videos: { hero: { url: "/", steps: [] } },
        }),
      );
      await expect(loadFullConfig([resolve(dir, "webreel.config.json")])).rejects.toThrow(
        "Duplicate video name",
      );
    } finally {
      cleanup();
    }
  });

  it("allows config with only scenarios and no videos", async () => {
    const demos = resolve(dir, "demos");
    mkdirSync(demos, { recursive: true });
    try {
      writeFileSync(
        resolve(demos, "a.webreel.json"),
        JSON.stringify({
          videos: { demo: { url: "/demo", steps: [] } },
        }),
      );
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          scenarios: ["./demos/*.webreel.json"],
        }),
      );
      const full = await loadFullConfig([resolve(dir, "webreel.config.json")]);
      expect(full.videos).toHaveLength(1);
      expect(full.videos[0].name).toBe("demo");
    } finally {
      cleanup();
    }
  });

  it("numbers inline scenarios in videoSources", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.json"),
        JSON.stringify({
          scenarios: [
            { videos: { a: { url: "/a", steps: [] } } },
            { videos: { b: { url: "/b", steps: [] } } },
          ],
        }),
      );
      const full = await loadFullConfig([resolve(dir, "webreel.config.json")]);
      expect(full.videoSources.get("a")).toContain("[scenario #1]");
      expect(full.videoSources.get("b")).toContain("[scenario #2]");
    } finally {
      cleanup();
    }
  });

  it("loads multiple configs via loadFullConfig", async () => {
    const dirA = resolve(dir, "a");
    const dirB = resolve(dir, "b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    try {
      writeFileSync(
        resolve(dirA, "webreel.config.json"),
        JSON.stringify({ videos: { alpha: { url: "/a", steps: [] } } }),
      );
      writeFileSync(
        resolve(dirB, "webreel.config.json"),
        JSON.stringify({ videos: { beta: { url: "/b", steps: [] } } }),
      );
      const full = await loadFullConfig([
        resolve(dirA, "webreel.config.json"),
        resolve(dirB, "webreel.config.json"),
      ]);
      expect(full.videos).toHaveLength(2);
      const names = full.videos.map((v) => v.name).sort();
      expect(names).toEqual(["alpha", "beta"]);
    } finally {
      cleanup();
    }
  });

  it("validates scenarios in validateWebreelConfig", () => {
    const errors = validateWebreelConfig({
      scenarios: [{ videos: { x: { url: "u", steps: [] } } }, "./demos/*.json"],
    });
    expect(errors).toEqual([]);
  });

  it("rejects scenarios with invalid elements", () => {
    const errors = validateWebreelConfig({
      scenarios: [123],
      videos: { x: { url: "u", steps: [] } },
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].path).toContain("scenarios[0]");
  });

  it("rejects inline scenario without videos", () => {
    const errors = validateWebreelConfig({
      scenarios: [{ baseUrl: "https://example.com" }],
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].path).toContain("scenarios[0].videos");
  });
});

describe("filterVideosByProject", () => {
  const videos: VideoConfig[] = [
    { name: "hero", url: "/", steps: [], configDir: "/tmp" },
    { name: "login", url: "/login", steps: [], configDir: "/tmp" },
    { name: "signup", url: "/signup", steps: [], configDir: "/tmp" },
    { name: "dashboard-light", url: "/dash", steps: [], configDir: "/tmp" },
    { name: "dashboard-dark", url: "/dash-dark", steps: [], configDir: "/tmp" },
  ] as VideoConfig[];

  it("returns all with empty patterns", () => {
    expect(filterVideosByProject(videos, [])).toEqual(videos);
  });

  it("filters by exact name", () => {
    const result = filterVideosByProject(videos, ["hero"]);
    expect(result.map((v) => v.name)).toEqual(["hero"]);
  });

  it("filters by glob pattern", () => {
    const result = filterVideosByProject(videos, ["dashboard-*"]);
    expect(result.map((v) => v.name)).toEqual(["dashboard-light", "dashboard-dark"]);
  });

  it("throws on missing exact name", () => {
    expect(() => filterVideosByProject(videos, ["nonexistent"])).toThrow(
      "Project(s) not found",
    );
  });

  it("does not throw on empty glob match", () => {
    expect(() => filterVideosByProject(videos, ["nothing*"])).toThrow(
      "No videos matched",
    );
  });

  it("combines exact and glob", () => {
    const result = filterVideosByProject(videos, ["hero", "dashboard-*"]);
    expect(result.map((v) => v.name)).toEqual([
      "hero",
      "dashboard-light",
      "dashboard-dark",
    ]);
  });
});

describe("filterVideos (union)", () => {
  const videos: VideoConfig[] = [
    { name: "hero", url: "/", steps: [], configDir: "/tmp" },
    { name: "login", url: "/login", steps: [], configDir: "/tmp" },
    { name: "signup", url: "/signup", steps: [], configDir: "/tmp" },
  ] as VideoConfig[];

  it("returns all with empty filters", () => {
    expect(filterVideos(videos, [], [])).toEqual(videos);
  });

  it("union of names and projects", () => {
    const result = filterVideos(videos, ["hero"], ["login"]);
    expect(result.map((v) => v.name)).toEqual(["hero", "login"]);
  });

  it("deduplicates overlapping filters", () => {
    const result = filterVideos(videos, ["hero"], ["hero"]);
    expect(result.map((v) => v.name)).toEqual(["hero"]);
  });
});

describe("defineConfig and defineScenario", () => {
  it("defineConfig returns the same object", async () => {
    const { defineConfig } = await import("../../config.js");
    const input = {
      baseUrl: "https://example.com",
      videos: { hero: { url: "/", steps: [] } },
    };
    expect(defineConfig(input)).toBe(input);
  });

  it("defineScenario returns the same object", async () => {
    const { defineScenario } = await import("../../config.js");
    const input = {
      extends: true as const,
      videos: { hero: { url: "/", steps: [] } },
    };
    expect(defineScenario(input)).toBe(input);
  });
});

describe("resolveConfigPaths", () => {
  const dir = resolve(tmpdir(), `webreel-resolve-paths-test-${Date.now()}`);

  function cleanup() {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  it("resolves explicit paths", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(resolve(dir, "a.json"), JSON.stringify({ videos: {} }));
      writeFileSync(resolve(dir, "b.json"), JSON.stringify({ videos: {} }));
      const paths = await resolveConfigPaths([
        resolve(dir, "a.json"),
        resolve(dir, "b.json"),
      ]);
      expect(paths).toHaveLength(2);
      expect(paths[0]).toBe(resolve(dir, "a.json"));
      expect(paths[1]).toBe(resolve(dir, "b.json"));
    } finally {
      cleanup();
    }
  });

  it("resolves glob patterns", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(resolve(dir, "x.webreel.json"), "{}");
      writeFileSync(resolve(dir, "y.webreel.json"), "{}");
      const paths = await resolveConfigPaths([resolve(dir, "*.webreel.json")]);
      expect(paths).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("throws on missing explicit path", async () => {
    await expect(resolveConfigPaths([resolve(dir, "nonexistent.json")])).rejects.toThrow(
      "not found",
    );
  });

  it("throws on glob with no matches", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      await expect(resolveConfigPaths([resolve(dir, "*.nope.json")])).rejects.toThrow(
        "No config files matched",
      );
    } finally {
      cleanup();
    }
  });

  it("deduplicates paths", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(resolve(dir, "a.json"), "{}");
      const paths = await resolveConfigPaths([
        resolve(dir, "a.json"),
        resolve(dir, "a.json"),
      ]);
      expect(paths).toHaveLength(1);
    } finally {
      cleanup();
    }
  });
});

describe("inline scenario with file extends", () => {
  const dir = resolve(tmpdir(), `webreel-scenario-file-extends-${Date.now()}`);

  function cleanup() {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  it("inline scenario extends a file path", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "base.json"),
        JSON.stringify({
          baseUrl: "https://base.com",
          defaultDelay: 300,
          videos: {},
        }),
      );
      writeFileSync(
        resolve(dir, "root.json"),
        JSON.stringify({
          scenarios: [
            {
              extends: "./base.json",
              videos: { demo: { url: "/demo", steps: [] } },
            },
          ],
        }),
      );
      const full = await loadFullConfig([resolve(dir, "root.json")]);
      expect(full.videos).toHaveLength(1);
      expect(full.videos[0].name).toBe("demo");
      expect(full.videos[0].baseUrl).toBe("https://base.com");
      expect(full.videos[0].defaultDelay).toBe(300);
    } finally {
      cleanup();
    }
  });
});

describe("nested scenarios warning", () => {
  const dir = resolve(tmpdir(), `webreel-nested-scenarios-${Date.now()}`);

  function cleanup() {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  it("warns and ignores nested scenarios", async () => {
    const subdir = resolve(dir, "sub");
    mkdirSync(subdir, { recursive: true });
    try {
      writeFileSync(
        resolve(subdir, "child.webreel.json"),
        JSON.stringify({
          scenarios: ["./nonexistent/*.json"],
          videos: { nested: { url: "/nested", steps: [] } },
        }),
      );
      writeFileSync(
        resolve(dir, "root.json"),
        JSON.stringify({
          scenarios: ["./sub/*.webreel.json"],
        }),
      );
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const full = await loadFullConfig([resolve(dir, "root.json")]);
        expect(full.videos).toHaveLength(1);
        expect(full.videos[0].name).toBe("nested");
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("scenarios"));
      } finally {
        warnSpy.mockRestore();
      }
    } finally {
      cleanup();
    }
  });
});

describe("loadFullConfig duplicate between root and scenario", () => {
  const dir = resolve(tmpdir(), `webreel-dup-root-scenario-${Date.now()}`);

  function cleanup() {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  it("detects duplicate between root videos and scenario videos", async () => {
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "root.json"),
        JSON.stringify({
          scenarios: [{ videos: { hero: { url: "/inline", steps: [] } } }],
          videos: { hero: { url: "/root", steps: [] } },
        }),
      );
      await expect(loadFullConfig([resolve(dir, "root.json")])).rejects.toThrow(
        "Duplicate video name",
      );
    } finally {
      cleanup();
    }
  });
});

describe("TS config with defineConfig and defineScenario", () => {
  it("loads TS config with defineConfig", async () => {
    const dir = resolve(
      tmpdir(),
      `webreel-ts-simple-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "webreel.config.ts"),
        `export default {
          baseUrl: "https://ts-test.com",
          videos: {
            demo: { url: "/demo", steps: [{ action: "pause", ms: 100 }] },
          },
        };`,
      );
      const config = await loadWebreelConfig(resolve(dir, "webreel.config.ts"));
      expect(config.videos).toHaveLength(1);
      expect(config.videos[0].name).toBe("demo");
      expect(config.baseUrl).toBe("https://ts-test.com");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads TS config with scenarios glob and inline extends", async () => {
    const dir = resolve(
      tmpdir(),
      `webreel-ts-scenarios-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const scenariosDir = resolve(dir, "scenarios");
    mkdirSync(scenariosDir, { recursive: true });
    try {
      writeFileSync(
        resolve(scenariosDir, "extra.webreel.json"),
        JSON.stringify({
          videos: {
            "glob-video": { url: "https://example.com/glob", steps: [] },
          },
        }),
      );
      writeFileSync(
        resolve(dir, "webreel.config.ts"),
        `export default {
          baseUrl: "https://root.com",
          viewport: { width: 1920, height: 1080 },
          scenarios: [
            "./scenarios/*.webreel.json",
            {
              extends: true,
              videos: {
                "inline-video": { url: "/inline", steps: [] },
              },
            },
          ],
          videos: {
            root: { url: "/root", steps: [] },
          },
        };`,
      );
      const full = await loadFullConfig([resolve(dir, "webreel.config.ts")]);
      expect(full.videos).toHaveLength(3);
      const names = full.videos.map((v) => v.name).sort();
      expect(names).toEqual(["glob-video", "inline-video", "root"]);

      const inlineVideo = full.videos.find((v) => v.name === "inline-video")!;
      expect(inlineVideo.baseUrl).toBe("https://root.com");
      expect(inlineVideo.viewport).toEqual({ width: 1920, height: 1080 });

      expect(full.videoSources.get("root")).toContain("webreel.config.ts");
      expect(full.videoSources.get("glob-video")).toContain("extra.webreel.json");
      expect(full.videoSources.get("inline-video")).toContain("[scenario #1]");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads TS config with extends", async () => {
    const dir = resolve(
      tmpdir(),
      `webreel-ts-extends-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        resolve(dir, "base.json"),
        JSON.stringify({
          baseUrl: "https://base.com",
          defaultDelay: 250,
          videos: {},
        }),
      );
      writeFileSync(
        resolve(dir, "child.ts"),
        `export default {
          extends: "./base.json",
          videos: {
            child: { url: "/child", steps: [] },
          },
        };`,
      );
      const config = await loadWebreelConfig(resolve(dir, "child.ts"));
      expect(config.baseUrl).toBe("https://base.com");
      expect(config.defaultDelay).toBe(250);
      expect(config.videos).toHaveLength(1);
      expect(config.videos[0].name).toBe("child");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("FullConfig public type export", () => {
  it("FullConfig is importable from config.ts", async () => {
    const mod = await import("../../config.js");
    expect(mod.loadFullConfig).toBeTypeOf("function");
    expect(mod.resolveConfigPaths).toBeTypeOf("function");
    expect(mod.loadWebreelConfig).toBeTypeOf("function");
    expect(mod.filterVideosByName).toBeTypeOf("function");
    expect(mod.defineConfig).toBeTypeOf("function");
    expect(mod.defineScenario).toBeTypeOf("function");
  });
});
