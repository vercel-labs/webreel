import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSfxPath, ensureSoundAssets, buildAudioMixArgs } from "../media.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "..", "..", "assets");

describe("resolveSfxPath", () => {
  it("returns default asset path when value is undefined", () => {
    expect(resolveSfxPath(undefined, "click")).toBe(resolve(ASSETS_DIR, "click-1.mp3"));
    expect(resolveSfxPath(undefined, "key")).toBe(resolve(ASSETS_DIR, "key-1.mp3"));
  });

  it("returns numbered asset path for numeric values", () => {
    expect(resolveSfxPath(1, "click")).toBe(resolve(ASSETS_DIR, "click-1.mp3"));
    expect(resolveSfxPath(2, "click")).toBe(resolve(ASSETS_DIR, "click-2.mp3"));
    expect(resolveSfxPath(3, "key")).toBe(resolve(ASSETS_DIR, "key-3.mp3"));
    expect(resolveSfxPath(4, "key")).toBe(resolve(ASSETS_DIR, "key-4.mp3"));
  });

  it("returns custom path as-is for string values", () => {
    expect(resolveSfxPath("/custom/click.mp3", "click")).toBe("/custom/click.mp3");
    expect(resolveSfxPath("relative/key.wav", "key")).toBe("relative/key.wav");
  });
});

describe("ensureSoundAssets", () => {
  it("returns default paths when no config provided", () => {
    const result = ensureSoundAssets();
    expect(result.clickPath).toBe(resolve(ASSETS_DIR, "click-1.mp3"));
    expect(result.keyPath).toBe(resolve(ASSETS_DIR, "key-1.mp3"));
  });

  it("returns default paths for empty config", () => {
    const result = ensureSoundAssets({});
    expect(result.clickPath).toBe(resolve(ASSETS_DIR, "click-1.mp3"));
    expect(result.keyPath).toBe(resolve(ASSETS_DIR, "key-1.mp3"));
  });

  it("respects numeric overrides", () => {
    const result = ensureSoundAssets({ click: 3, key: 2 });
    expect(result.clickPath).toBe(resolve(ASSETS_DIR, "click-3.mp3"));
    expect(result.keyPath).toBe(resolve(ASSETS_DIR, "key-2.mp3"));
  });

  it("respects custom string paths", () => {
    const result = ensureSoundAssets({ click: "/my/click.mp3", key: "/my/key.mp3" });
    expect(result.clickPath).toBe("/my/click.mp3");
    expect(result.keyPath).toBe("/my/key.mp3");
  });
});

describe("buildAudioMixArgs", () => {
  it("produces correct structure with no events", () => {
    const { inputArgs, filterComplex } = buildAudioMixArgs("input.mp4", [], 10);
    expect(inputArgs).toContain("-i");
    expect(inputArgs).toContain("input.mp4");
    expect(inputArgs).toContain("anullsrc=r=44100:cl=mono");
    expect(inputArgs).toContain("10.000");
    expect(filterComplex).toContain("amix=inputs=1");
  });

  it("adds sound file inputs for each event", () => {
    const events = [
      { type: "click" as const, timeMs: 500 },
      { type: "key" as const, timeMs: 1000 },
    ];
    const { inputArgs, filterComplex } = buildAudioMixArgs("input.mp4", events, 5);

    const inputCount = inputArgs.filter((a) => a === "-i").length;
    expect(inputCount).toBe(4);

    expect(filterComplex).toContain("[2]");
    expect(filterComplex).toContain("[3]");
    expect(filterComplex).toContain("adelay=500|500");
    expect(filterComplex).toContain("adelay=1000|1000");
    expect(filterComplex).toContain("amix=inputs=3");
  });

  it("clamps event timeMs to duration", () => {
    const events = [{ type: "click" as const, timeMs: 99999 }];
    const { filterComplex } = buildAudioMixArgs("input.mp4", events, 2);
    expect(filterComplex).toContain("adelay=2000|2000");
  });

  it("includes volume and rate parameters in filter", () => {
    const events = [{ type: "click" as const, timeMs: 0 }];
    const { filterComplex } = buildAudioMixArgs("input.mp4", events, 1);
    expect(filterComplex).toMatch(/volume=\d+\.\d+/);
    expect(filterComplex).toMatch(/asetrate=\d+/);
    expect(filterComplex).toContain("aresample=44100");
  });

  it("uses click sound file for click events and key sound for key events", () => {
    const events = [
      { type: "click" as const, timeMs: 0 },
      { type: "key" as const, timeMs: 100 },
    ];
    const { inputArgs } = buildAudioMixArgs("input.mp4", events, 1);

    const clickPath = resolve(ASSETS_DIR, "click-1.mp3");
    const keyPath = resolve(ASSETS_DIR, "key-1.mp3");
    expect(inputArgs).toContain(clickPath);
    expect(inputArgs).toContain(keyPath);
  });

  it("respects custom sfx config", () => {
    const events = [{ type: "click" as const, timeMs: 0 }];
    const { inputArgs } = buildAudioMixArgs("input.mp4", events, 1, { click: 3 });
    const clickPath = resolve(ASSETS_DIR, "click-3.mp3");
    expect(inputArgs).toContain(clickPath);
  });
});
