import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, extname } from "node:path";
import sharp from "sharp";
import type { TimelineData } from "./timeline.js";
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
  zoomFilter?: string;
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
      options?.zoomFilter,
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
  zoomFilter?: string,
): Promise<void> {
  const { width, height, fps } = timeline;

  // Build the overlay context once — sharp metadata and cursor-scale caches
  // are identical across stages, so we share the context.
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

  // Pipeline layering:
  //   - No autozoom: single overlay pass draws cursor+HUD on raw → output.
  //   - Autozoom:    three sequential ffmpeg invocations. Stage A overlays
  //                  cursor-only (not HUD) on raw. Stage B applies zoompan
  //                  on the cursor-overlaid intermediate. Stage C overlays
  //                  HUD on the zoomed frame. HUD stays at the final
  //                  viewport coordinates regardless of how the camera
  //                  crops/scales — captions never get cropped by zoom.
  //
  // Why three stages instead of one? (1) zoompan + image2pipe in the same
  // filter_complex deadlocks when the pipe reader can't drain fast enough
  // (see detailed note in the original single-pass version of this file).
  // (2) HUD on top of the zoomed frame must run after zoompan or it gets
  // cropped out of the camera window.
  if (!zoomFilter) {
    await runOverlayStage(
      ffmpegPath,
      cleanVideoPath,
      timeline,
      ctx,
      "both",
      outputPath,
      crf,
      fps,
      width,
      height,
    );
    return;
  }

  const cursorStagePath = resolve(homedir(), ".webreel", `_cursor_${Date.now()}.mp4`);
  const zoomStagePath = resolve(homedir(), ".webreel", `_zoom_${Date.now()}.mp4`);

  try {
    await runOverlayStage(
      ffmpegPath,
      cleanVideoPath,
      timeline,
      ctx,
      "cursor",
      cursorStagePath,
      crf,
      fps,
      width,
      height,
    );
    await applyZoomPass(ffmpegPath, cursorStagePath, zoomFilter, zoomStagePath, crf, fps);
    await runOverlayStage(
      ffmpegPath,
      zoomStagePath,
      timeline,
      ctx,
      "hud",
      outputPath,
      crf,
      fps,
      width,
      height,
    );
  } finally {
    rmSync(cursorStagePath, { force: true });
    rmSync(zoomStagePath, { force: true });
  }
}

async function runOverlayStage(
  ffmpegPath: string,
  inputPath: string,
  timeline: TimelineData,
  ctx: OverlayContext,
  layer: OverlayLayer,
  outputPath: string,
  crf: number,
  fps: number,
  width: number,
  height: number,
): Promise<void> {
  const ffmpeg = spawn(
    ffmpegPath,
    [
      "-y",
      "-i",
      inputPath,
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

  const overlayCache = new Map<string, Buffer>();
  const hudCache = new Map<string, sharp.OverlayOptions>();

  const stdin = ffmpeg.stdin;
  if (!stdin) throw new Error("ffmpeg process has no stdin pipe");

  // ffmpeg may close its read side of the pipe early when `overlay=shortest=1`
  // truncates to the shorter input (e.g., raw video has fewer frames than the
  // timeline). Node surfaces that as an EPIPE 'error' event on stdin and an
  // uncaught error will crash the process. Swallow it and stop writing — the
  // frames already fed are enough for ffmpeg to produce output up to the
  // truncation point.
  let stdinClosed = false;
  stdin.on("error", (err) => {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr && nodeErr.code === "EPIPE") {
      stdinClosed = true;
    } else {
      throw err;
    }
  });

  // Wait for the stream's buffer to drain. Races against the error event so
  // we don't hang forever if ffmpeg closed the read side before drain fires.
  const drain = (): Promise<void> =>
    new Promise((res) => {
      const onDrain = () => {
        stdin.off("error", onError);
        res();
      };
      const onError = () => {
        stdin.off("drain", onDrain);
        res();
      };
      stdin.once("drain", onDrain);
      stdin.once("error", onError);
    });

  for (let i = 0; i < timeline.frames.length; i++) {
    if (stdinClosed) break;
    const frame = timeline.frames[i];
    const overlayPng = await renderOverlayFrame(
      frame,
      width,
      height,
      ctx,
      overlayCache,
      hudCache,
      layer,
    );

    if (stdinClosed) break;
    const ok = stdin.write(overlayPng);
    if (!ok) await drain();
  }

  if (!stdin.writableEnded) {
    try {
      stdin.end();
    } catch {
      // stream may already be errored — safe to ignore
    }
  }

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
            `Overlay-stage ffmpeg (layer=${layer}) exited with code ${code}${stderr ? `:\n${stderr}` : ""}`,
          ),
        );
      }
    });
    ffmpeg.on("error", rejectAll);
  });
}

async function applyZoomPass(
  ffmpegPath: string,
  inputPath: string,
  zoomFilter: string,
  outputPath: string,
  crf: number,
  fps: number,
): Promise<void> {
  const ffmpeg = spawn(
    ffmpegPath,
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      zoomFilter,
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
    { stdio: ["ignore", "pipe", "pipe"] },
  );

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
            `Zoom-pass ffmpeg exited with code ${code}${stderr ? `:\n${stderr}` : ""}`,
          ),
        );
      }
    });
    ffmpeg.on("error", rejectAll);
  });
}

type OverlayLayer = "both" | "cursor" | "hud";

async function renderOverlayFrame(
  frame: TimelineData["frames"][number],
  width: number,
  height: number,
  ctx: OverlayContext,
  cache: Map<string, Buffer>,
  hudCache: Map<string, sharp.OverlayOptions>,
  layer: OverlayLayer = "both",
): Promise<Buffer> {
  const cx = Math.round(frame.cursor.x * ctx.zoom * 10) / 10;
  const cy = Math.round(frame.cursor.y * ctx.zoom * 10) / 10;
  const scale = frame.cursor.scale;
  const hudKey = frame.hud ? frame.hud.labels.join("|") : "";
  const cacheKey = `${layer}:${cx},${cy},${scale},${hudKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const overlays: sharp.OverlayOptions[] = [];

  const icx = Math.round(frame.cursor.x * ctx.zoom) - ctx.hotspotOffsetX;
  const icy = Math.round(frame.cursor.y * ctx.zoom) - ctx.hotspotOffsetY;
  const cursorVisible =
    icx >= -ctx.cursorWidth && icx < width && icy >= -ctx.cursorHeight && icy < height;

  const wantCursor = layer !== "hud";
  const wantHud = layer !== "cursor";

  if (wantCursor && cursorVisible) {
    const cursorImg = scale !== 1 ? await ctx.getScaledCursor(scale) : ctx.cursorPng;
    const left = Math.max(0, icx);
    const top = Math.max(0, icy);

    if (left < width && top < height) {
      overlays.push({ input: cursorImg, left, top });
    }
  }

  if (wantHud && frame.hud && frame.hud.labels.length > 0) {
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

  const fontSize = Math.round(hudConfig.fontSize * zoom);
  const padding = Math.round(16 * zoom);
  const gap = Math.round(14 * zoom);
  const borderRadius = Math.round(hudConfig.borderRadius * zoom);
  const hPad = Math.round(36 * zoom);

  const charWidth = fontSize * 0.6;
  const totalTextWidth = labels.reduce((sum, l) => sum + l.length * charWidth, 0);
  const hudWidth = Math.round(
    totalTextWidth + padding * 2 + gap * (labels.length - 1) + hPad * 2,
  );
  const hudHeight = Math.round(fontSize * 1.6 + padding * 2);

  const labelSpans = labels
    .map((l) => {
      const escaped = l
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<tspan>${escaped}</tspan>`;
    })
    .join(`<tspan dx="${gap}"> </tspan>`);

  const textY = Math.round(hudHeight / 2 + fontSize * 0.35);
  const textX = Math.round(hudWidth / 2);

  const escAttr = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const margin = Math.round(48 * zoom);
  const maxHudWidth = Math.max(100, viewportWidth - margin * 2);
  const renderedHudWidth = Math.min(hudWidth, maxHudWidth);

  const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${renderedHudWidth}" height="${hudHeight}" viewBox="0 0 ${hudWidth} ${hudHeight}" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="${hudWidth}" height="${hudHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="${escAttr(hudConfig.background)}" />
      <text x="${textX}" y="${textY}" text-anchor="middle"
        font-family="${escAttr(hudConfig.fontFamily)}" font-size="${fontSize}" font-weight="500"
        fill="${escAttr(hudConfig.color)}">${labelSpans}</text>
    </svg>`;

  const hudPng = await sharp(Buffer.from(svgOverlay)).png().toBuffer();
  const left = Math.round((viewportWidth - renderedHudWidth) / 2);
  const top = hudConfig.position === "top" ? margin : viewportHeight - hudHeight - margin;

  const result: sharp.OverlayOptions = { input: hudPng, left, top };
  hudCache.set(cacheKey, result);
  return result;
}
