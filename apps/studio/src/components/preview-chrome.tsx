"use client";

import type { WindowConfig, BackgroundConfig } from "@/store/config";
import { buildBackgroundStyle, buildShadowStyle } from "@/lib/preview-utils";
import { cn } from "@/lib/utils";

export function PreviewWithChrome({
  canvasW,
  canvasH,
  vpWidth,
  vpHeight,
  scale,
  titlebarH,
  titlebarVisible,
  borderRadius,
  windowCfg,
  backgroundCfg,
  iframeKey,
  iframeRef,
  iframeSrc,
  selectedVideo,
  pickMode,
  previewCursor,
}: {
  canvasW: number;
  canvasH: number;
  vpWidth: number;
  vpHeight: number;
  scale: number;
  titlebarH: number;
  titlebarVisible: boolean;
  borderRadius: number;
  windowCfg?: WindowConfig;
  backgroundCfg?: BackgroundConfig;
  iframeKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  iframeSrc: string;
  selectedVideo: string | null;
  pickMode: boolean;
  previewCursor: string;
}) {
  const windowTotalH = vpHeight + titlebarH;
  let winX: number;
  let winY: number;
  if (
    windowCfg?.position &&
    typeof windowCfg.position === "object" &&
    "x" in windowCfg.position
  ) {
    winX = windowCfg.position.x;
    winY = windowCfg.position.y;
  } else {
    winX = Math.round((canvasW - vpWidth) / 2);
    winY = Math.round((canvasH - windowTotalH) / 2);
  }

  const shadow = buildShadowStyle(windowCfg?.shadow);
  const tbBg = windowCfg?.titlebar?.background ?? "#e8e8e8";
  const tbStoplight = windowCfg?.titlebar?.stoplight !== false;
  const tbTitle = windowCfg?.titlebar?.title ?? "";

  return (
    <div
      className={cn("relative overflow-hidden", pickMode && "ring-2 ring-blue-500/50")}
      style={{
        width: canvasW * scale,
        height: canvasH * scale,
        cursor: previewCursor,
      }}
    >
      <div
        style={{
          width: canvasW,
          height: canvasH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "relative",
          ...buildBackgroundStyle(backgroundCfg),
        }}
      >
        <div
          style={{
            position: "absolute",
            left: winX,
            top: winY,
            width: vpWidth,
            borderRadius,
            boxShadow: shadow,
            overflow: "hidden",
          }}
        >
          {titlebarVisible && titlebarH > 0 && (
            <div
              style={{
                height: titlebarH,
                background: tbBg,
                display: "flex",
                alignItems: "center",
                paddingLeft: 16,
                paddingRight: 16,
                position: "relative",
                userSelect: "none",
              }}
            >
              {tbStoplight && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "#FF5F57",
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "#FEBC2E",
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "#28C840",
                      display: "inline-block",
                    }}
                  />
                </div>
              )}
              {tbTitle && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 12,
                    color: "#4d4d4d",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "60%",
                  }}
                >
                  {tbTitle}
                </span>
              )}
            </div>
          )}
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={iframeSrc}
            title={`Preview: ${selectedVideo}`}
            style={{
              width: vpWidth,
              height: vpHeight,
              border: "none",
              display: "block",
            }}
          />
        </div>
      </div>
    </div>
  );
}
