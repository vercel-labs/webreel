import { describe, it, expect } from "vitest";
import { installRevealObserver, collectReveals, __TESTING__ } from "../revealObserver.js";

interface Call {
  expression: string;
}

function createMockClient(
  response: { value?: unknown } | (() => { value?: unknown }) | Error,
) {
  const calls: Call[] = [];
  const client = {
    Runtime: {
      evaluate: async (params: { expression: string }) => {
        calls.push({ expression: params.expression });
        if (response instanceof Error) throw response;
        const r = typeof response === "function" ? response() : response;
        return { result: r };
      },
    },
  } as never;
  return { client, calls };
}

describe("installRevealObserver", () => {
  it("returns a handle when the page returns a number", async () => {
    const { client } = createMockClient({ value: 42 });
    const handle = await installRevealObserver(client);
    expect(handle).toEqual({ id: 42 });
  });

  it("returns null when the page returns a non-number", async () => {
    const { client } = createMockClient({ value: null });
    const handle = await installRevealObserver(client);
    expect(handle).toBeNull();
  });

  it("returns null when Runtime.evaluate throws", async () => {
    const { client } = createMockClient(new Error("cdp failed"));
    const handle = await installRevealObserver(client);
    expect(handle).toBeNull();
  });

  it("evaluates the MutationObserver install IIFE", async () => {
    const { client, calls } = createMockClient({ value: 1 });
    await installRevealObserver(client);
    expect(calls).toHaveLength(1);
    expect(calls[0].expression).toContain("MutationObserver");
    expect(calls[0].expression).toContain("__wrReveals");
    expect(calls[0].expression).toContain("observer.observe");
  });
});

describe("collectReveals", () => {
  it("returns the array of bounding boxes the page yields", async () => {
    const boxes = [{ x: 10, y: 20, width: 100, height: 50 }];
    const { client, calls } = createMockClient({ value: boxes });
    const result = await collectReveals(client, { id: 7 });
    expect(result).toEqual(boxes);
    // The collect expression must reference the handle id so the page
    // script finds the right observer state.
    expect(calls[0].expression).toContain("(7)");
    expect(calls[0].expression).toContain("disconnect");
    expect(calls[0].expression).toContain("getBoundingClientRect");
  });

  it("returns empty array when the page returns non-array", async () => {
    const { client } = createMockClient({ value: "oops" });
    const result = await collectReveals(client, { id: 1 });
    expect(result).toEqual([]);
  });

  it("returns empty array when Runtime.evaluate throws", async () => {
    const { client } = createMockClient(new Error("cdp failed"));
    const result = await collectReveals(client, { id: 1 });
    expect(result).toEqual([]);
  });
});

describe("reveal scripts (sanity check on string contents)", () => {
  it("INSTALL_SCRIPT filters overlay elements and tracks visibility", () => {
    expect(__TESTING__.INSTALL_SCRIPT).toContain("preVisible");
    expect(__TESTING__.INSTALL_SCRIPT).toContain("attributeFilter");
  });

  it("COLLECT_SCRIPT filters __demo- and tiny mutations", () => {
    expect(__TESTING__.COLLECT_SCRIPT).toContain("__demo-");
    expect(__TESTING__.COLLECT_SCRIPT).toContain("MIN_AREA");
  });
});
