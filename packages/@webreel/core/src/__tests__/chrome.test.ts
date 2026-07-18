import { describe, it, expect, vi, afterEach } from "vitest";
import { cftPlatform, buildChromeArgs, shouldDisableSandbox } from "../chrome.js";

describe("cftPlatform", () => {
  it("returns a valid Chrome for Testing platform string", () => {
    const result = cftPlatform();
    const valid = ["mac-arm64", "mac-x64", "linux64", "linux-arm64", "win64"];
    expect(valid).toContain(result);
  });

  it("returns correct value for current platform", () => {
    const { platform, arch } = process;
    const result = cftPlatform();

    if (platform === "darwin" && arch === "arm64") {
      expect(result).toBe("mac-arm64");
    } else if (platform === "darwin") {
      expect(result).toBe("mac-x64");
    } else if (platform === "linux" && arch === "arm64") {
      expect(result).toBe("linux-arm64");
    } else if (platform === "linux") {
      expect(result).toBe("linux64");
    } else if (platform === "win32") {
      expect(result).toBe("win64");
    }
  });
});

describe("buildChromeArgs", () => {
  const port = 12345;
  const userDataDir = "/tmp/webreel-chrome-test";

  it("excludes --no-sandbox for headless when noSandbox is false", () => {
    const args = buildChromeArgs(true, port, userDataDir, false);
    expect(args).not.toContain("--no-sandbox");
  });

  it("includes --no-sandbox for headless when noSandbox is true", () => {
    const args = buildChromeArgs(true, port, userDataDir, true);
    expect(args).toContain("--no-sandbox");
  });

  it("excludes --no-sandbox for headful when noSandbox is false", () => {
    const args = buildChromeArgs(false, port, userDataDir, false);
    expect(args).not.toContain("--no-sandbox");
  });

  it("includes --no-sandbox for headful when noSandbox is true", () => {
    const args = buildChromeArgs(false, port, userDataDir, true);
    expect(args).toContain("--no-sandbox");
  });

  it("always includes the remote debugging port and user data dir", () => {
    const args = buildChromeArgs(true, port, userDataDir, false);
    expect(args).toContain(`--remote-debugging-port=${port}`);
    expect(args).toContain(`--user-data-dir=${userDataDir}`);
  });
});

describe("shouldDisableSandbox", () => {
  const originalEnv = process.env.WEBREEL_NO_SANDBOX;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WEBREEL_NO_SANDBOX;
    } else {
      process.env.WEBREEL_NO_SANDBOX = originalEnv;
    }
    vi.restoreAllMocks();
  });

  it("returns false by default", () => {
    delete process.env.WEBREEL_NO_SANDBOX;
    vi.spyOn(process, "getuid").mockReturnValue(501);
    expect(shouldDisableSandbox()).toBe(false);
  });

  it("returns true when WEBREEL_NO_SANDBOX=1", () => {
    process.env.WEBREEL_NO_SANDBOX = "1";
    vi.spyOn(process, "getuid").mockReturnValue(501);
    expect(shouldDisableSandbox()).toBe(true);
  });

  it("returns true when running as root (getuid() === 0)", () => {
    delete process.env.WEBREEL_NO_SANDBOX;
    vi.spyOn(process, "getuid").mockReturnValue(0);
    expect(shouldDisableSandbox()).toBe(true);
  });
});
