import { describe, it, expect, vi, beforeEach } from "vitest";
import { moveFileSync } from "../fs.js";
import * as fs from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return {
    ...actual,
    renameSync: vi.fn(),
    copyFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("moveFileSync", () => {
  it("uses renameSync when source and dest are on the same device", () => {
    moveFileSync("/tmp/a.mp4", "/tmp/b.mp4");

    expect(fs.renameSync).toHaveBeenCalledWith("/tmp/a.mp4", "/tmp/b.mp4");
    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it("falls back to copy+delete on EXDEV error", () => {
    const exdev = Object.assign(new Error("cross-device link not permitted"), {
      code: "EXDEV",
    });
    vi.mocked(fs.renameSync).mockImplementation(() => {
      throw exdev;
    });

    moveFileSync("/dev1/a.mp4", "/dev2/b.mp4");

    expect(fs.copyFileSync).toHaveBeenCalledWith("/dev1/a.mp4", "/dev2/b.mp4");
    expect(fs.rmSync).toHaveBeenCalledWith("/dev1/a.mp4", { force: true });
  });

  it("re-throws non-EXDEV errors", () => {
    const enoent = Object.assign(new Error("no such file"), { code: "ENOENT" });
    vi.mocked(fs.renameSync).mockImplementation(() => {
      throw enoent;
    });

    expect(() => moveFileSync("/tmp/missing.mp4", "/tmp/b.mp4")).toThrow("no such file");
    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });
});
