import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { btbnAssetName, binaryName, findBinaryInDir } from "../ffmpeg.js";

describe("btbnAssetName", () => {
  it("returns a string or null depending on platform", () => {
    const result = btbnAssetName();
    if (process.platform === "linux") {
      expect(result).toMatch(/^ffmpeg-n7\.1-latest-linux/);
      expect(result).toMatch(/\.tar\.xz$/);
    } else if (process.platform === "win32") {
      expect(result).toMatch(/^ffmpeg-n7\.1-latest-win64/);
      expect(result).toMatch(/\.zip$/);
    } else {
      expect(result).toBeNull();
    }
  });
});

describe("binaryName", () => {
  it("returns ffmpeg.exe on win32 and ffmpeg elsewhere", () => {
    const result = binaryName();
    if (process.platform === "win32") {
      expect(result).toBe("ffmpeg.exe");
    } else {
      expect(result).toBe("ffmpeg");
    }
  });
});

describe("findBinaryInDir", () => {
  let testDir: string;

  function setup() {
    testDir = resolve(tmpdir(), `webreel-ffmpeg-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("returns null for non-existent directory", () => {
    expect(findBinaryInDir("/does/not/exist", "ffmpeg")).toBeNull();
  });

  it("finds binary directly in the directory", () => {
    setup();
    try {
      writeFileSync(resolve(testDir, "ffmpeg"), "");
      expect(findBinaryInDir(testDir, "ffmpeg")).toBe(resolve(testDir, "ffmpeg"));
    } finally {
      cleanup();
    }
  });

  it("finds binary in a nested bin/ subdirectory", () => {
    setup();
    try {
      const nested = resolve(testDir, "ffmpeg-7.1", "bin");
      mkdirSync(nested, { recursive: true });
      writeFileSync(resolve(nested, "ffmpeg"), "");
      expect(findBinaryInDir(testDir, "ffmpeg")).toBe(
        resolve(testDir, "ffmpeg-7.1", "bin", "ffmpeg"),
      );
    } finally {
      cleanup();
    }
  });

  it("finds binary flat inside a nested subdirectory", () => {
    setup();
    try {
      const nested = resolve(testDir, "ffmpeg-build");
      mkdirSync(nested, { recursive: true });
      writeFileSync(resolve(nested, "ffmpeg"), "");
      expect(findBinaryInDir(testDir, "ffmpeg")).toBe(
        resolve(testDir, "ffmpeg-build", "ffmpeg"),
      );
    } finally {
      cleanup();
    }
  });

  it("returns null when binary is not found", () => {
    setup();
    try {
      mkdirSync(resolve(testDir, "empty-dir"), { recursive: true });
      expect(findBinaryInDir(testDir, "ffmpeg")).toBeNull();
    } finally {
      cleanup();
    }
  });
});
