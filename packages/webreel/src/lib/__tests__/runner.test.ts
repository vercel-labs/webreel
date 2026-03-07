import { describe, it, expect, vi, afterEach } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  formatStep,
  resolveKeyTarget,
  resolveUrl,
  randomPointInBox,
  resolveTarget,
} from "../runner.js";
import type { Step } from "../types.js";

describe("formatStep", () => {
  it("formats pause step", () => {
    const step: Step = { action: "pause", ms: 500 };
    expect(formatStep(0, step)).toBe("[step 0] pause 500ms");
  });

  it("formats click step with text", () => {
    const step: Step = { action: "click", text: "Submit" };
    expect(formatStep(1, step)).toBe('[step 1] click text="Submit"');
  });

  it("formats click step with selector", () => {
    const step: Step = { action: "click", selector: "#btn" };
    expect(formatStep(2, step)).toBe('[step 2] click selector="#btn"');
  });

  it("formats key step", () => {
    const step: Step = { action: "key", key: "cmd+z" };
    expect(formatStep(3, step)).toBe('[step 3] key "cmd+z"');
  });

  it("formats type step", () => {
    const step: Step = { action: "type", text: "hello" };
    expect(formatStep(0, step)).toBe('[step 0] type "hello"');
  });

  it("formats scroll step with defaults", () => {
    const step: Step = { action: "scroll" };
    expect(formatStep(0, step)).toBe("[step 0] scroll x=0 y=0");
  });

  it("formats scroll step with values", () => {
    const step: Step = { action: "scroll", x: 100, y: -200 };
    expect(formatStep(0, step)).toBe("[step 0] scroll x=100 y=-200");
  });

  it("formats wait step with selector", () => {
    const step: Step = { action: "wait", selector: ".loaded" };
    expect(formatStep(0, step)).toBe('[step 0] wait selector=".loaded"');
  });

  it("formats wait step with text", () => {
    const step: Step = { action: "wait", text: "Ready" };
    expect(formatStep(0, step)).toBe('[step 0] wait text="Ready"');
  });

  it("formats drag step", () => {
    const step: Step = {
      action: "drag",
      from: { text: "A" },
      to: { text: "B" },
    };
    expect(formatStep(0, step)).toBe("[step 0] drag");
  });

  it("formats moveTo step", () => {
    const step: Step = { action: "moveTo", text: "Menu" };
    expect(formatStep(0, step)).toBe('[step 0] moveTo text="Menu"');
  });

  it("formats screenshot step", () => {
    const step: Step = { action: "screenshot", output: "hero.png" };
    expect(formatStep(0, step)).toBe('[step 0] screenshot "hero.png"');
  });

  it("formats navigate step", () => {
    const step: Step = { action: "navigate", url: "https://example.com" };
    expect(formatStep(0, step)).toBe('[step 0] navigate "https://example.com"');
  });

  it("formats hover step", () => {
    const step: Step = { action: "hover", text: "Link" };
    expect(formatStep(0, step)).toBe('[step 0] hover text="Link"');
  });

  it("formats select step", () => {
    const step: Step = { action: "select", selector: "#country", value: "US" };
    expect(formatStep(0, step)).toBe('[step 0] select "#country" value="US"');
  });

  it("includes description when present", () => {
    const step: Step = { action: "pause", ms: 100, description: "wait for animation" };
    expect(formatStep(0, step)).toBe("[step 0] pause 100ms: wait for animation");
  });
});

describe("resolveKeyTarget", () => {
  it("returns string target directly", () => {
    expect(resolveKeyTarget("#input")).toBe("#input");
  });

  it("returns selector from ElementTarget", () => {
    expect(resolveKeyTarget({ selector: ".editor" })).toBe(".editor");
  });

  it("returns empty string when ElementTarget has no selector", () => {
    expect(resolveKeyTarget({ text: "foo" })).toBe("");
  });
});

describe("resolveUrl", () => {
  const configDir = "/home/user/project";

  it("returns absolute http URLs unchanged", () => {
    expect(resolveUrl("https://example.com", "", configDir)).toBe("https://example.com");
    expect(resolveUrl("http://localhost:3000", "", configDir)).toBe(
      "http://localhost:3000",
    );
  });

  it("returns file:// URLs unchanged", () => {
    expect(resolveUrl("file:///tmp/index.html", "", configDir)).toBe(
      "file:///tmp/index.html",
    );
  });

  it("prepends baseUrl to relative URLs", () => {
    expect(resolveUrl("/page", "https://example.com", configDir)).toBe(
      "https://example.com/page",
    );
  });

  it("converts relative paths to file:// URLs using configDir", () => {
    const result = resolveUrl("index.html", "", configDir);
    expect(result).toBe(pathToFileURL(resolve(configDir, "index.html")).href);
  });

  it("converts relative path with baseUrl to file:// when combined is not http", () => {
    const result = resolveUrl("sub/index.html", "web/", configDir);
    expect(result).toBe(pathToFileURL(resolve(configDir, "web/sub/index.html")).href);
  });
});

describe("randomPointInBox", () => {
  const box = { x: 100, y: 200, width: 50, height: 30 };

  it("returns a point within the bounding box", () => {
    for (let i = 0; i < 50; i++) {
      const { x, y } = randomPointInBox(box);
      expect(x).toBeGreaterThanOrEqual(box.x);
      expect(x).toBeLessThanOrEqual(box.x + box.width);
      expect(y).toBeGreaterThanOrEqual(box.y);
      expect(y).toBeLessThanOrEqual(box.y + box.height);
    }
  });

  it("constrains points to the center region by default", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { x, y } = randomPointInBox(box);
      expect(x).toBeCloseTo(box.x + box.width * 0.375, 5);
      expect(y).toBeCloseTo(box.y + box.height * 0.375, 5);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("uses custom spread parameter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { x, y } = randomPointInBox(box, 0.5);
      expect(x).toBeCloseTo(box.x + box.width * 0.5, 5);
      expect(y).toBeCloseTo(box.y + box.height * 0.5, 5);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

vi.mock("@webreel/core", async () => {
  const actual = await vi.importActual<typeof import("@webreel/core")>("@webreel/core");
  return {
    ...actual,
    findElementByText: vi.fn(),
    findElementBySelector: vi.fn(),
  };
});

import { findElementByText, findElementBySelector } from "@webreel/core";

const mockedFindByText = vi.mocked(findElementByText);
const mockedFindBySelector = vi.mocked(findElementBySelector);

describe("resolveTarget", () => {
  const mockClient = {} as never;
  const mockBox = { x: 10, y: 20, width: 100, height: 50 };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves by selector", async () => {
    mockedFindBySelector.mockResolvedValue(mockBox);
    const result = await resolveTarget(mockClient, { selector: "#foo" });
    expect(result).toEqual(mockBox);
    expect(mockedFindBySelector).toHaveBeenCalledWith(mockClient, "#foo", undefined);
  });

  it("resolves by text", async () => {
    mockedFindByText.mockResolvedValue(mockBox);
    const result = await resolveTarget(mockClient, { text: "Hello" });
    expect(result).toEqual(mockBox);
    expect(mockedFindByText).toHaveBeenCalledWith(mockClient, "Hello", undefined);
  });

  it("passes within to findElementBySelector", async () => {
    mockedFindBySelector.mockResolvedValue(mockBox);
    await resolveTarget(mockClient, { selector: "#input", within: ".modal" });
    expect(mockedFindBySelector).toHaveBeenCalledWith(mockClient, "#input", ".modal");
    expect(mockedFindByText).not.toHaveBeenCalled();
  });

  it("throws when neither text nor selector provided", async () => {
    await expect(resolveTarget(mockClient, {})).rejects.toThrow(
      'resolveTarget requires "text" or "selector"',
    );
  });

  it("throws when element not found", async () => {
    mockedFindBySelector.mockResolvedValue(null);
    await expect(resolveTarget(mockClient, { selector: "#missing" })).rejects.toThrow(
      "Element not found",
    );
  });
});
