import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, extname } from "node:path";
import sharp from "sharp";
import type { TimelineData } from "./timeline.js";
import { ensureFfmpeg } from "./ffmpeg.js";
import { buildGifFilter, finalizeMp4, finalizeWebm, type SfxConfig } from "./media.js";
import { runFfmpegAsync, spawnFfmpegStreaming } from "./ffmpeg-run.js";

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
  const zoomFilter = options?.zoomFilter;

  const zoom = timelineData.zoom ?? 1;
  const cursorPng = await renderCursorPng(
    timelineData.theme.cursorSvg,
    timelineData.theme.cursorSize,
    zoom,
  );

  const ext = extname(outputPath).toLowerCase();
  const { width, fps } = timelineData;

  if (!zoomFilter) {
    if (ext === ".gif") {
      const gifConfig = buildGifConfig(width, outputPath);
      await compositeFrames(
        ffmpegPath,
        cleanVideoPath,
        timelineData,
        cursorPng,
        zoom,
        gifConfig,
        "both",
      );
      return;
    }

    const workDir = resolve(homedir(), ".webreel");
    mkdirSync(workDir, { recursive: true });
    const tempComposed = resolve(workDir, `_composed_${Date.now()}.mp4`);

    try {
      const mp4Config = buildMp4Config(fps, crf, tempComposed);
      await compositeFrames(
        ffmpegPath,
        cleanVideoPath,
        timelineData,
        cursorPng,
        zoom,
        mp4Config,
        "both",
      );
      finalizeComposed(ffmpegPath, tempComposed, outputPath, timelineData, sfx);
    } finally {
      rmSync(tempComposed, { force: true });
    }
    return;
  }

  // Autozoom pipeline layering:
  //   Stage A overlays cursor-only (not HUD) on the raw video. Stage B
  //   applies zoompan on the cursor-overlaid intermediate. Stage C overlays
  //   HUD on the zoomed frame. HUD stays at the final viewport coordinates
  //   regardless of how the camera crops/scales, so captions never get
  //   cropped by zoom.
  //
  // Why three stages instead of one? (1) zoompan + image2pipe in the same
  // filter_complex deadlocks when the pipe reader can't drain fast enough.
  // (2) HUD on top of the zoomed frame must run after zoompan or it gets
  // cropped out of the camera window.
  const workDir = resolve(homedir(), ".webreel");
  mkdirSync(workDir, { recursive: true });
  const cursorStagePath = resolve(workDir, `_cursor_${Date.now()}.mp4`);
  const zoomStagePath = resolve(workDir, `_zoom_${Date.now()}.mp4`);
  const tempComposed = resolve(workDir, `_composed_${Date.now()}.mp4`);

  try {
    await compositeFrames(
      ffmpegPath,
      cleanVideoPath,
      timelineData,
      cursorPng,
      zoom,
      buildMp4Config(fps, crf, cursorStagePath),
      "cursor",
    );
    await applyZoomPass(ffmpegPath, cursorStagePath, zoomFilter, zoomStagePath, crf, fps);

    if (ext === ".gif") {
      await compositeFrames(
        ffmpegPath,
        zoomStagePath,
        timelineData,
        cursorPng,
        zoom,
        buildGifConfig(width, outputPath),
        "hud",
      );
      return;
    }

    await compositeFrames(
      ffmpegPath,
      zoomStagePath,
      timelineData,
      cursorPng,
      zoom,
      buildMp4Config(fps, crf, tempComposed),
      "hud",
    );
    finalizeComposed(ffmpegPath, tempComposed, outputPath, timelineData, sfx);
  } finally {
    rmSync(cursorStagePath, { force: true });
    rmSync(zoomStagePath, { force: true });
    rmSync(tempComposed, { force: true });
  }
}

function finalizeComposed(
  ffmpegPath: string,
  tempComposed: string,
  outputPath: string,
  timelineData: TimelineData,
  sfx: SfxConfig | undefined,
): void {
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
  } else {
    finalizeMp4(ffmpegPath, tempComposed, outputPath, timelineData.events, durationSec, {
      remux: true,
      sfx,
    });
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

export interface CompositorFfmpegConfig {
  filterComplex: string;
  outputArgs: string[];
}

export function buildMp4Config(
  fps: number,
  crf: number,
  outputPath: string,
): CompositorFfmpegConfig {
  return {
    filterComplex: "[0][1]overlay=0:0:shortest=1",
    outputArgs: [
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
  };
}

export function buildGifConfig(
  width: number,
  outputPath: string,
): CompositorFfmpegConfig {
  return {
    filterComplex: `[0][1]overlay=0:0:shortest=1,${buildGifFilter(width)}`,
    outputArgs: ["-loop", "0", outputPath],
  };
}

async function compositeFrames(
  ffmpegPath: string,
  inputVideoPath: string,
  timeline: TimelineData,
  cursorPng: Buffer,
  zoom: number,
  config: CompositorFfmpegConfig,
  layer: OverlayLayer,
): Promise<void> {
  const { width, height, fps } = timeline;

  const PREFETCH_QUEUE_SIZE = 4;

  const state = {
    abortError: null as Error | null,
    producerDone: false,
    // Resolves when the queue has items OR the producer is done.
    queueResolve: null as (() => void) | null,
    // Resolves when the consumer dequeues an item (backpressure signal).
    spaceResolve: null as (() => void) | null,
    // Resolves the consumer's in-flight drain() wait.
    drainResolve: null as (() => void) | null,
  };

  const notifyConsumer = () => {
    if (state.queueResolve) {
      const r = state.queueResolve;
      state.queueResolve = null;
      r();
    }
  };

  const notifyProducer = () => {
    if (state.spaceResolve) {
      const r = state.spaceResolve;
      state.spaceResolve = null;
      r();
    }
  };

  const notifyDrain = () => {
    if (state.drainResolve) {
      const r = state.drainResolve;
      state.drainResolve = null;
      r();
    }
  };

  // Wake every waiter so the producer/consumer loop unwinds instead of
  // hanging on a drain event a dead stream will never emit. Fired for a
  // genuine (non-post-end) stdin error, or a process close that races ahead
  // of stdin.end() - see ffmpeg-run.ts's onPipeError/onPrematureClose docs.
  const onAbort = (err: Error) => {
    if (!state.abortError) state.abortError = err;
    notifyConsumer();
    notifyProducer();
    notifyDrain();
  };

  const handle = spawnFfmpegStreaming(
    ffmpegPath,
    [
      "-y",
      "-i",
      inputVideoPath,
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-c:v",
      "png",
      "-i",
      "pipe:0",
      "-filter_complex",
      config.filterComplex,
      ...config.outputArgs,
    ],
    `Compositor ffmpeg (layer=${layer})`,
    { onPipeError: onAbort, onPrematureClose: onAbort },
  );
  const stdin = handle.stdin;

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

  const queue: Buffer[] = [];

  const enqueue = (buf: Buffer) => {
    queue.push(buf);
    notifyConsumer();
  };

  const waitForItem = (): Promise<void> =>
    new Promise((r) => {
      if (queue.length > 0 || state.producerDone) return r();
      state.queueResolve = r;
    });

  const waitForSpace = (): Promise<void> =>
    new Promise((r) => {
      if (queue.length < PREFETCH_QUEUE_SIZE) return r();
      state.spaceResolve = r;
    });

  const drain = (): Promise<void> =>
    new Promise((r) => {
      if (state.abortError) return r();
      state.drainResolve = r;
      stdin.once("drain", r);
    });

  const consumer = async () => {
    while (true) {
      if (queue.length === 0 && state.producerDone) break;
      if (queue.length === 0) await waitForItem();
      if (queue.length === 0) break;
      if (state.abortError) break;

      while (queue.length > 0) {
        const buf = queue.shift()!;
        notifyProducer();
        const ok = stdin.write(buf);
        if (!ok && !state.abortError) await drain();
        if (state.abortError) break;
      }
    }
    stdin.end();
  };

  const consumerPromise = consumer();

  for (let i = 0; i < timeline.frames.length; i++) {
    if (state.abortError) break;

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

    if (state.abortError) break;

    if (queue.length >= PREFETCH_QUEUE_SIZE) await waitForSpace();

    if (!state.abortError) enqueue(overlayPng);
  }
  state.producerDone = true;
  notifyConsumer();

  await consumerPromise;

  if (state.abortError) {
    // handle.done already has a no-op catch attached internally, so its
    // eventual rejection (from the killed process exiting nonzero) won't
    // surface as an unhandled rejection alongside the throw below.
    handle.kill();
    throw state.abortError;
  }

  await handle.done;
}

async function applyZoomPass(
  ffmpegPath: string,
  inputPath: string,
  zoomFilter: string,
  outputPath: string,
  crf: number,
  fps: number,
): Promise<void> {
  await runFfmpegAsync(
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
    "Zoom-pass ffmpeg",
  );
}

type OverlayLayer = "both" | "cursor" | "hud";

async function renderOverlayFrame(
  frame: TimelineData["frames"][number],
  width: number,
  height: number,
  ctx: OverlayContext,
  cache: Map<string, Buffer>,
  hudCache: Map<string, sharp.OverlayOptions>,
  layer: OverlayLayer,
): Promise<Buffer> {
  // Whole-pixel rounding is intentional: sub-pixel precision defeats the
  // overlay cache during cursor dwell/pause (float jitter creates unique keys).
  // The 1px difference is imperceptible at screen resolution and invisible
  // in GIF output (downsampled to 15fps with lanczos).
  const cx = Math.round(frame.cursor.x * ctx.zoom);
  const cy = Math.round(frame.cursor.y * ctx.zoom);
  const scale = frame.cursor.scale;
  const hudKey = frame.hud ? frame.hud.labels.join("|") : "";
  const cacheKey = `${layer}:${cx},${cy},${scale},${hudKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const overlays: sharp.OverlayOptions[] = [];

  const icx = cx - ctx.hotspotOffsetX;
  const icy = cy - ctx.hotspotOffsetY;
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

  // Clamp the rendered HUD to the viewport (with margins) via viewBox so
  // long label sets scale down instead of overflowing the frame.
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
