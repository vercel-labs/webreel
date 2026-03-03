import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, extname } from "node:path";
import sharp from "sharp";
import type { TimelineData } from "./timeline.js";
import { MODIFIER_ICONS } from "./types.js";
import { ensureFfmpeg } from "./ffmpeg.js";
import { finalizeMp4, finalizeWebm, finalizeGif, type SfxConfig } from "./media.js";

interface OverlayContext {
  cursorPng: Buffer;
  cursorWidth: number;
  cursorHeight: number;
  hotspotOffsetX: number;
  hotspotOffsetY: number;
  getScaledCursor: (scale: number) => Promise<Buffer>;
  zoom: number;
  hudConfig: TimelineData["theme"]["hud"];
}

export interface ComposeOptions {
  sfx?: SfxConfig;
  crf?: number;
}

export async function compose(
  cleanVideoPath: string,
  timelineData: TimelineData,
  outputPath: string,
  options?: ComposeOptions,
): Promise<void> {
  const ffmpegPath = await ensureFfmpeg();
  const sfx = options?.sfx;
  const crf = options?.crf ?? 18;

  const zoom = timelineData.zoom ?? 1;
  const cursorPng = await renderCursorPng(
    timelineData.theme.cursorSvg,
    timelineData.theme.cursorSize,
    zoom,
  );

  const workDir = resolve(homedir(), ".webreel");
  mkdirSync(workDir, { recursive: true });
  const tempComposed = resolve(workDir, `_composed_${Date.now()}.mp4`);

  try {
    await compositeFrames(
      ffmpegPath,
      cleanVideoPath,
      timelineData,
      cursorPng,
      zoom,
      tempComposed,
      crf,
    );

    const ext = extname(outputPath).toLowerCase();
    const durationSec = timelineData.frames.length / timelineData.fps;

    if (ext === ".webm") {
      finalizeWebm(
        ffmpegPath,
        tempComposed,
        outputPath,
        timelineData.events,
        durationSec,
        sfx,
      );
    } else if (ext === ".gif") {
      finalizeGif(ffmpegPath, tempComposed, outputPath, timelineData.width);
    } else {
      finalizeMp4(
        ffmpegPath,
        tempComposed,
        outputPath,
        timelineData.events,
        durationSec,
        { remux: true, sfx },
      );
    }
  } finally {
    rmSync(tempComposed, { force: true });
  }
}

async function renderCursorPng(
  svgContent: string,
  size: number,
  zoom: number,
): Promise<Buffer> {
  const scaledSize = Math.round(size * zoom);
  const svgWithSize = svgContent
    .replace(/width="[^"]*"/, `width="${scaledSize}"`)
    .replace(/height="[^"]*"/, `height="${scaledSize}"`);

  return sharp(Buffer.from(svgWithSize)).png().toBuffer();
}

async function compositeFrames(
  ffmpegPath: string,
  cleanVideoPath: string,
  timeline: TimelineData,
  cursorPng: Buffer,
  zoom: number,
  outputPath: string,
  crf: number,
): Promise<void> {
  const { width, height, fps } = timeline;

  const ffmpeg = spawn(
    ffmpegPath,
    [
      "-y",
      "-i",
      cleanVideoPath,
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-c:v",
      "png",
      "-i",
      "pipe:0",
      "-filter_complex",
      "[0][1]overlay=0:0:shortest=1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      String(crf),
      "-pix_fmt",
      "yuv420p",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      "-movflags",
      "+faststart",
      "-r",
      String(fps),
      outputPath,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  const cursorMeta = await sharp(cursorPng).metadata();
  if (!cursorMeta.width || !cursorMeta.height) {
    throw new Error("Failed to read cursor image dimensions from sharp metadata");
  }
  const cursorWidth = cursorMeta.width;
  const cursorHeight = cursorMeta.height;

  const scaledCursorCache = new Map<number, Buffer>();
  scaledCursorCache.set(100, cursorPng);

  const getScaledCursor = async (scale: number): Promise<Buffer> => {
    const key = Math.round(scale * 100);
    let cached = scaledCursorCache.get(key);
    if (cached) return cached;
    const sw = Math.max(1, Math.round(cursorWidth * scale));
    const sh = Math.max(1, Math.round(cursorHeight * scale));
    cached = await sharp(cursorPng).resize(sw, sh).png().toBuffer();
    scaledCursorCache.set(key, cached);
    return cached;
  };

  const hotspot = timeline.theme.cursorHotspot ?? "top-left";
  const hotspotOffsetX = hotspot === "center" ? Math.round(cursorWidth / 2) : 0;
  const hotspotOffsetY = hotspot === "center" ? Math.round(cursorHeight / 2) : 0;

  const ctx: OverlayContext = {
    cursorPng,
    cursorWidth,
    cursorHeight,
    hotspotOffsetX,
    hotspotOffsetY,
    getScaledCursor,
    zoom,
    hudConfig: timeline.theme.hud,
  };

  const overlayCache = new Map<string, Buffer>();
  const hudCache = new Map<string, sharp.OverlayOptions>();

  const stdin = ffmpeg.stdin;
  if (!stdin) throw new Error("ffmpeg process has no stdin pipe");

  const drain = (): Promise<void> => new Promise((res) => stdin.once("drain", res));

  for (let i = 0; i < timeline.frames.length; i++) {
    const frame = timeline.frames[i];
    const overlayPng = await renderOverlayFrame(
      frame,
      width,
      height,
      ctx,
      overlayCache,
      hudCache,
    );

    const ok = stdin.write(overlayPng);
    if (!ok) await drain();
  }

  stdin.end();

  const stderrChunks: Buffer[] = [];
  ffmpeg.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  await new Promise<void>((resolveAll, rejectAll) => {
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolveAll();
      } else {
        const stderr = Buffer.concat(stderrChunks).toString().slice(-2000);
        rejectAll(
          new Error(
            `Compositor ffmpeg exited with code ${code}${stderr ? `:\n${stderr}` : ""}`,
          ),
        );
      }
    });
    ffmpeg.on("error", rejectAll);
  });
}

async function renderOverlayFrame(
  frame: TimelineData["frames"][number],
  width: number,
  height: number,
  ctx: OverlayContext,
  cache: Map<string, Buffer>,
  hudCache: Map<string, sharp.OverlayOptions>,
): Promise<Buffer> {
  const cx = Math.round(frame.cursor.x * ctx.zoom * 10) / 10;
  const cy = Math.round(frame.cursor.y * ctx.zoom * 10) / 10;
  const scale = frame.cursor.scale;
  const hudKey = frame.hud ? frame.hud.labels.join("|") : "";
  const cacheKey = `${cx},${cy},${scale},${hudKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const overlays: sharp.OverlayOptions[] = [];

  const icx = Math.round(frame.cursor.x * ctx.zoom) - ctx.hotspotOffsetX;
  const icy = Math.round(frame.cursor.y * ctx.zoom) - ctx.hotspotOffsetY;
  const cursorVisible =
    icx >= -ctx.cursorWidth && icx < width && icy >= -ctx.cursorHeight && icy < height;

  if (cursorVisible) {
    const cursorImg = scale !== 1 ? await ctx.getScaledCursor(scale) : ctx.cursorPng;
    const left = Math.max(0, icx);
    const top = Math.max(0, icy);

    if (left < width && top < height) {
      overlays.push({ input: cursorImg, left, top });
    }
  }

  if (frame.hud && frame.hud.labels.length > 0) {
    const hudOverlay = await renderHudOverlay(
      frame.hud.labels,
      width,
      height,
      ctx.zoom,
      ctx.hudConfig,
      hudCache,
    );
    if (hudOverlay) overlays.push(hudOverlay);
  }

  const result = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      overlays.length > 0
        ? overlays
        : [
            {
              input: Buffer.from([0, 0, 0, 0]),
              raw: { width: 1, height: 1, channels: 4 },
              left: 0,
              top: 0,
            },
          ],
    )
    .png({ compressionLevel: 1 })
    .toBuffer();

  cache.set(cacheKey, result);
  return result;
}

function parseKeyPadding(padding: string, zoom: number): { v: number; h: number } {
  const parts = padding.split(/\s+/).map((p) => Math.round(parseFloat(p) * zoom));
  return { v: parts[0], h: parts[1] ?? parts[0] };
}

async function renderHudOverlay(
  labels: string[],
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  hudConfig: TimelineData["theme"]["hud"],
  hudCache: Map<string, sharp.OverlayOptions>,
): Promise<sharp.OverlayOptions | null> {
  const cacheKey = labels.join("|");
  const cached = hudCache.get(cacheKey);
  if (cached) return cached;

  const escAttr = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const fontSize = Math.round(hudConfig.fontSize * zoom);
  const gap = Math.round(10 * zoom);
  const keyBorderRadius = Math.round(hudConfig.keyBorderRadius * zoom);
  const keyPad = parseKeyPadding(hudConfig.keyPadding, zoom);

  const shadowPad = Math.round(20 * zoom);
  const shadowOffset = Math.round(4 * zoom);
  const shadowBlur = Math.round(8 * zoom);

  const charWidth = fontSize * 0.6;
  const iconSize = Math.round(fontSize * 0.75);
  const capHeight = fontSize + keyPad.v * 2;
  const keyCaps = labels.map((l) => {
    const isIcon = l in MODIFIER_ICONS;
    const contentWidth = isIcon ? iconSize : Math.round(l.length * charWidth);
    const capWidth = contentWidth + keyPad.h * 2;
    return { label: l, isIcon, contentWidth, capWidth };
  });

  const totalKeysWidth = keyCaps.reduce((s, k) => s + k.capWidth, 0);
  const innerWidth = totalKeysWidth + gap * (labels.length - 1);
  const hudWidth = innerWidth + shadowPad * 2;
  const hudHeight = capHeight + shadowPad * 2;

  let keyRects = "";
  let x = shadowPad;
  const capY = shadowPad;

  for (const cap of keyCaps) {
    keyRects += `<rect x="${x}" y="${capY}" width="${cap.capWidth}" height="${capHeight}" rx="${keyBorderRadius}" ry="${keyBorderRadius}" fill="${escAttr(hudConfig.keyBackground)}" stroke="${escAttr(hudConfig.keyBorder)}" stroke-width="1" filter="url(#keyShadow)" />`;

    if (cap.isIcon) {
      const icon = MODIFIER_ICONS[cap.label];
      const ix = Math.round(x + (cap.capWidth - iconSize) / 2);
      const iy = Math.round(capY + (capHeight - iconSize) / 2);
      const pathEls = icon.paths
        .map(
          (p) =>
            `<path d="${p}" fill="none" stroke="${escAttr(hudConfig.color)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join("");
      keyRects += `<svg x="${ix}" y="${iy}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24">${pathEls}</svg>`;
    } else {
      const escaped = cap.label
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const textX = Math.round(x + cap.capWidth / 2);
      const textY = Math.round(capY + capHeight / 2 + fontSize * 0.35);
      keyRects += `<text x="${textX}" y="${textY}" text-anchor="middle" font-family="${escAttr(hudConfig.fontFamily)}" font-size="${fontSize}" font-weight="500" letter-spacing="0.02em" fill="${escAttr(hudConfig.color)}">${escaped}</text>`;
    }

    x += cap.capWidth + gap;
  }

  const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${hudWidth}" height="${hudHeight}">
    <defs>
      <filter id="keyShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="${shadowOffset}" stdDeviation="${shadowBlur}" flood-color="rgba(0,0,0,0.35)" flood-opacity="1" />
      </filter>
    </defs>
    ${keyRects}
  </svg>`;

  const hudPng = await sharp(Buffer.from(svgOverlay)).png().toBuffer();
  const left = Math.round((viewportWidth - hudWidth) / 2);
  const margin = Math.round(48 * zoom);
  const top = hudConfig.position === "top" ? margin : viewportHeight - hudHeight - margin;

  const result: sharp.OverlayOptions = { input: hudPng, left, top };
  hudCache.set(cacheKey, result);
  return result;
}
