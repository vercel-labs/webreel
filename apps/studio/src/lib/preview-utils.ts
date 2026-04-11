import { useState, useEffect } from "react";
import type { ThemeConfig, WindowConfig, BackgroundConfig } from "@/store/config";

const CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.85 2.35a.5.5 0 0 0-.35.86z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export function buildCursorStyle(size: number, hotspot: "top-left" | "center"): string {
  const scaledSvg = CURSOR_SVG.replace(
    /width="24" height="24"/,
    `width="${size}" height="${size}"`,
  );
  const encoded = encodeURIComponent(scaledSvg)
    .replace(/%20/g, " ")
    .replace(/%22/g, "'")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/");

  const hx = hotspot === "center" ? Math.round(size / 2) : Math.round(size * 0.2);
  const hy = hotspot === "center" ? Math.round(size / 2) : Math.round(size * 0.1);

  return `url("data:image/svg+xml,${encoded}") ${hx} ${hy}, auto`;
}

export function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

export function resolvePreviewUrl(url: string, baseUrl?: string, configBaseUrl?: string) {
  const base = baseUrl || configBaseUrl;
  if (!base) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

export function buildThemePayload(videoTheme?: ThemeConfig, configTheme?: ThemeConfig) {
  return {
    cursor: {
      size: videoTheme?.cursor?.size ?? configTheme?.cursor?.size ?? 24,
      hotspot: videoTheme?.cursor?.hotspot ?? configTheme?.cursor?.hotspot ?? "top-left",
    },
    hud: {
      background:
        videoTheme?.hud?.background ?? configTheme?.hud?.background ?? "rgba(0,0,0,0.5)",
      color:
        videoTheme?.hud?.color ?? configTheme?.hud?.color ?? "rgba(255,255,255,0.85)",
      fontSize: videoTheme?.hud?.fontSize ?? configTheme?.hud?.fontSize ?? 56,
      fontFamily:
        videoTheme?.hud?.fontFamily ??
        configTheme?.hud?.fontFamily ??
        '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
      borderRadius: videoTheme?.hud?.borderRadius ?? configTheme?.hud?.borderRadius ?? 18,
      position: videoTheme?.hud?.position ?? configTheme?.hud?.position ?? "bottom",
    },
  };
}

export function buildBackgroundStyle(bg?: BackgroundConfig): React.CSSProperties {
  if (!bg) return { background: "#e0e0e0" };
  switch (bg.type) {
    case "gradient": {
      const { from = "#667eea", to = "#764ba2", angle = 180 } = bg.gradient ?? {};
      return { background: `linear-gradient(${angle}deg, ${from}, ${to})` };
    }
    case "image":
      return {
        backgroundImage: bg.image ? `url(${bg.image})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#e0e0e0",
      };
    case "solid":
    default:
      return { background: bg.color ?? "#e0e0e0" };
  }
}

export function buildShadowStyle(shadow?: WindowConfig["shadow"]): string | undefined {
  if (!shadow) return undefined;
  const blur = typeof shadow === "object" ? (shadow.blur ?? 40) : 40;
  const color =
    typeof shadow === "object"
      ? (shadow.color ?? "rgba(0,0,0,0.35)")
      : "rgba(0,0,0,0.35)";
  const offsetY = typeof shadow === "object" ? (shadow.offsetY ?? 10) : 10;
  return `0 ${offsetY}px ${blur}px ${color}`;
}

export function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function sendToIframe(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  type: string,
  payload?: Record<string, unknown>,
) {
  iframeRef.current?.contentWindow?.postMessage(
    { type, payload },
    window.location.origin,
  );
}
