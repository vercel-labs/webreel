import type { CDPClient } from "./types.js";
import {
  DEFAULT_CURSOR_SVG,
  OFFSCREEN_MARGIN,
  DEFAULT_CURSOR_SIZE,
  DEFAULT_HUD_THEME,
} from "./types.js";

export interface OverlayTheme {
  cursorSvg?: string;
  cursorSize?: number;
  cursorHotspot?: "top-left" | "center";
  hud?: {
    background?: string;
    color?: string;
    fontSize?: number;
    fontFamily?: string;
    borderRadius?: number;
    position?: "top" | "bottom";
  };
}

export async function injectOverlays(
  client: CDPClient,
  theme?: OverlayTheme,
  initialPosition?: { x: number; y: number },
): Promise<void> {
  const cursorSize = theme?.cursorSize ?? DEFAULT_CURSOR_SIZE;
  const cursorSvg = theme?.cursorSvg ?? DEFAULT_CURSOR_SVG;
  const hotspotOffset = theme?.cursorHotspot === "center" ? cursorSize / 2 : 0;
  const hudBg = theme?.hud?.background ?? DEFAULT_HUD_THEME.background;
  const hudColor = theme?.hud?.color ?? DEFAULT_HUD_THEME.color;
  const hudFontSize = theme?.hud?.fontSize ?? DEFAULT_HUD_THEME.fontSize;
  const hudFontFamily = theme?.hud?.fontFamily ?? DEFAULT_HUD_THEME.fontFamily;
  const hudBorderRadius = theme?.hud?.borderRadius ?? DEFAULT_HUD_THEME.borderRadius;
  const hudPosition = theme?.hud?.position ?? DEFAULT_HUD_THEME.position;

  await client.Runtime.evaluate({
    expression: `(() => {
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;

      const cursor = document.createElement("div");
      cursor.id = "__demo-cursor";
      cursor.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "z-index:999999",
        "pointer-events:none",
        "width:${cursorSize}px",
        "height:${cursorSize}px",
        "margin-left:${-hotspotOffset}px",
        "margin-top:${-hotspotOffset}px",
        "transform-origin:top left",
        "will-change:transform",
        "transform:translate(${initialPosition?.x ?? -OFFSCREEN_MARGIN}px,${initialPosition?.y ?? -OFFSCREEN_MARGIN}px)",
        "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
      ].join(";");
      cursor.dataset.cx = "${initialPosition?.x ?? -OFFSCREEN_MARGIN}";
      cursor.dataset.cy = "${initialPosition?.y ?? -OFFSCREEN_MARGIN}";
      cursor.innerHTML = ${JSON.stringify(cursorSvg)};
      document.body.appendChild(cursor);

      const z = (v) => (v / zoom) + "px";
      const keys = document.createElement("div");
      keys.id = "__demo-keys";
      keys.style.cssText = [
        "position:fixed",
        "z-index:999999",
        "pointer-events:none",
        "${hudPosition}:" + z(48),
        "left:50%",
        "transform:translateX(-50%)",
        "display:flex",
        "gap:" + z(14),
        "padding:" + z(16) + " " + z(36),
        "border-radius:" + z(${hudBorderRadius}),
        "background:${hudBg}",
        "opacity:0",
      ].join(";");
      document.body.appendChild(keys);

      const style = document.createElement("style");
      style.textContent = \`
        .__demo-key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: ${hudColor};
          font-family: ${hudFontFamily};
          font-size: \${${hudFontSize} / zoom}px;
          font-weight: 500;
          white-space: nowrap;
        }
      \`;
      document.head.appendChild(style);
    })()`,
  });
}

export async function showKeys(client: CDPClient, labels: string[]): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const container = document.getElementById("__demo-keys");
      if (!container) return;
      container.innerHTML = ${JSON.stringify(labels)}
        .map(k => {
          const e = k.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
          return '<span class="__demo-key">' + e + '</span>';
        })
        .join("");
      container.style.opacity = "1";
    })()`,
  });
}

export async function hideKeys(client: CDPClient): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const container = document.getElementById("__demo-keys");
      if (container) container.style.opacity = "0";
    })()`,
  });
}
