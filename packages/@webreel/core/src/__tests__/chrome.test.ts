import { describe, it, expect } from "vitest";
import { cftPlatform } from "../chrome.js";

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
