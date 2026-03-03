import { describe, it, expect } from "vitest";
import { DEFAULT_CURSOR_SVG, DEFAULT_CURSOR_SIZE, DEFAULT_HUD_THEME } from "../types.js";
import type { OverlayTheme } from "../overlays.js";
import { injectOverlays, showKeys, hideKeys } from "../overlays.js";

function createMockClient() {
  const calls: { method: string; expression: string }[] = [];
  const client = {
    Runtime: {
      evaluate: async (params: { expression: string }) => {
        calls.push({ method: "evaluate", expression: params.expression });
        return { result: {} };
      },
    },
  } as never;
  return { client, calls };
}

describe("injectOverlays", () => {
  it("uses default cursor size when no theme provided", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client);
    expect(calls).toHaveLength(1);
    expect(calls[0].expression).toContain(`width:${DEFAULT_CURSOR_SIZE}px`);
    expect(calls[0].expression).toContain(`height:${DEFAULT_CURSOR_SIZE}px`);
  });

  it("uses custom cursor size from theme", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client, { cursorSize: 48 });
    expect(calls[0].expression).toContain("width:48px");
    expect(calls[0].expression).toContain("height:48px");
  });

  it("applies top-left hotspot with zero margin offset", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client, { cursorHotspot: "top-left" });
    expect(calls[0].expression).toContain("margin-left:0px");
    expect(calls[0].expression).toContain("margin-top:0px");
  });

  it("applies center hotspot with half-size margin offset", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client, { cursorSize: 32, cursorHotspot: "center" });
    expect(calls[0].expression).toContain("margin-left:-16px");
    expect(calls[0].expression).toContain("margin-top:-16px");
  });

  it("uses custom HUD theme values", async () => {
    const { client, calls } = createMockClient();
    const theme: OverlayTheme = {
      hud: {
        color: "blue",
        fontSize: 32,
        position: "top",
      },
    };
    await injectOverlays(client, theme);
    const expr = calls[0].expression;
    expect(expr).toContain("color: blue");
    expect(expr).toContain('"top:"');
  });

  it("applies backdrop-filter blur on key caps", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client);
    const expr = calls[0].expression;
    expect(expr).toContain(`backdrop-filter: blur(${DEFAULT_HUD_THEME.blur}px)`);
    expect(expr).toContain(`-webkit-backdrop-filter: blur(${DEFAULT_HUD_THEME.blur}px)`);
  });

  it("styles key caps with background and border", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client);
    const expr = calls[0].expression;
    expect(expr).toContain(`background: ${DEFAULT_HUD_THEME.keyBackground}`);
    expect(expr).toContain(`border: 1px solid ${DEFAULT_HUD_THEME.keyBorder}`);
    expect(expr).toContain("box-shadow:");
  });

  it("container has no background (transparent layout wrapper)", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client);
    const expr = calls[0].expression;
    expect(expr).not.toMatch(/keys\.style\.cssText[^;]*background:/);
  });

  it("includes transition for smooth animation", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client);
    const expr = calls[0].expression;
    expect(expr).toContain("transition:opacity 0.2s ease,transform 0.2s ease");
  });

  it("uses custom cursor SVG", async () => {
    const { client, calls } = createMockClient();
    const svg = '<svg><circle r="10"/></svg>';
    await injectOverlays(client, { cursorSvg: svg });
    expect(calls[0].expression).toContain(JSON.stringify(svg));
  });

  it("uses default cursor SVG when none provided", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client);
    expect(calls[0].expression).toContain(JSON.stringify(DEFAULT_CURSOR_SVG));
  });

  it("applies initial cursor position", async () => {
    const { client, calls } = createMockClient();
    await injectOverlays(client, undefined, { x: 100, y: 200 });
    const expr = calls[0].expression;
    expect(expr).toContain("translate(100px,200px)");
    expect(expr).toContain('dataset.cx = "100"');
    expect(expr).toContain('dataset.cy = "200"');
  });
});

describe("showKeys", () => {
  it("passes labels to the expression", async () => {
    const { client, calls } = createMockClient();
    await showKeys(client, ["Ctrl", "Z"]);
    expect(calls[0].expression).toContain(JSON.stringify(["Ctrl", "Z"]));
  });

  it("expression includes HTML entity escaping for &, <, >", async () => {
    const { client, calls } = createMockClient();
    await showKeys(client, ["<test>"]);
    const expr = calls[0].expression;
    expect(expr).toContain("&amp;");
    expect(expr).toContain("&lt;");
    expect(expr).toContain("&gt;");
  });

  it("sets transform to visible position on show", async () => {
    const { client, calls } = createMockClient();
    await showKeys(client, ["A"]);
    const expr = calls[0].expression;
    expect(expr).toContain("translateX(-50%) translateY(0)");
  });
});

describe("hideKeys", () => {
  it("sets opacity to 0", async () => {
    const { client, calls } = createMockClient();
    await hideKeys(client);
    expect(calls[0].expression).toContain('opacity = "0"');
  });

  it("sets transform to offset position on hide", async () => {
    const { client, calls } = createMockClient();
    await hideKeys(client);
    expect(calls[0].expression).toContain("translateX(-50%) translateY(8px)");
  });
});
