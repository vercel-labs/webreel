import type { CDPClient } from "./types.js";
import {
  DEFAULT_CURSOR_SVG,
  OFFSCREEN_MARGIN,
  DEFAULT_CURSOR_SIZE,
  DEFAULT_HUD_THEME,
  MODIFIER_ICONS,
} from "./types.js";

function buildIconSvgMap(color: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [char, icon] of Object.entries(MODIFIER_ICONS)) {
    const paths = icon.paths
      .map(
        (p) =>
          `<path d="${p}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join("");
    map[char] =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" style="display:block">${paths}</svg>`;
  }
  return map;
}

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
    blur?: number;
    border?: string;
    shadow?: string;
    keyBackground?: string;
    keyBorder?: string;
    keyBorderRadius?: number;
    keyPadding?: string;
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
  const hudColor = theme?.hud?.color ?? DEFAULT_HUD_THEME.color;
  const hudFontSize = theme?.hud?.fontSize ?? DEFAULT_HUD_THEME.fontSize;
  const hudFontFamily = theme?.hud?.fontFamily ?? DEFAULT_HUD_THEME.fontFamily;
  const hudPosition = theme?.hud?.position ?? DEFAULT_HUD_THEME.position;
  const hudBlur = theme?.hud?.blur ?? DEFAULT_HUD_THEME.blur;
  const hudKeyBg = theme?.hud?.keyBackground ?? DEFAULT_HUD_THEME.keyBackground;
  const hudKeyBorder = theme?.hud?.keyBorder ?? DEFAULT_HUD_THEME.keyBorder;
  const hudKeyBorderRadius =
    theme?.hud?.keyBorderRadius ?? DEFAULT_HUD_THEME.keyBorderRadius;
  const hudKeyPadding = theme?.hud?.keyPadding ?? DEFAULT_HUD_THEME.keyPadding;

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
        "transform:translateX(-50%) translateY(8px)",
        "display:flex",
        "align-items:center",
        "gap:" + z(10),
        "opacity:0",
        "transition:opacity 0.2s ease,transform 0.2s ease",
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
          letter-spacing: 0.02em;
          white-space: nowrap;
          background: ${hudKeyBg};
          backdrop-filter: blur(${hudBlur}px);
          -webkit-backdrop-filter: blur(${hudBlur}px);
          border: 1px solid ${hudKeyBorder};
          border-radius: \${${hudKeyBorderRadius} / zoom}px;
          padding: ${hudKeyPadding};
          box-shadow: 0 4px 16px rgba(0,0,0,0.35);
          line-height: 1;
        }
      \`;
      document.head.appendChild(style);
    })()`,
  });
}

export async function showKeys(
  client: CDPClient,
  labels: string[],
  iconColor?: string,
): Promise<void> {
  const icons = buildIconSvgMap(iconColor ?? DEFAULT_HUD_THEME.color);
  await client.Runtime.evaluate({
    expression: `(() => {
      const container = document.getElementById("__demo-keys");
      if (!container) return;
      const icons = ${JSON.stringify(icons)};
      container.innerHTML = ${JSON.stringify(labels)}
        .map(k => {
          if (icons[k]) return '<span class="__demo-key">' + icons[k] + '</span>';
          const e = k.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
          return '<span class="__demo-key">' + e + '</span>';
        })
        .join("");
      container.style.opacity = "1";
      container.style.transform = "translateX(-50%) translateY(0)";
    })()`,
  });
}

export async function hideKeys(client: CDPClient): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const container = document.getElementById("__demo-keys");
      if (container) {
        container.style.opacity = "0";
        container.style.transform = "translateX(-50%) translateY(8px)";
      }
    })()`,
  });
}
