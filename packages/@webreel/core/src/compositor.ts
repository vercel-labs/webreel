import { accessSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, extname } from "node:path";
import type { TimelineData, TimelineWindowConfig } from "./timeline.js";
import { ensureFfmpeg } from "./ffmpeg.js";
import { finalizeMp4, finalizeWebm, finalizeGif, type SfxConfig } from "./media.js";

let nativeCompositor: typeof import("@webreel/compositor") | null = null;
try {
  nativeCompositor = await import("@webreel/compositor");
} catch {
  // Native compositor not available
}

export interface ComposeOptions {
  sfx?: SfxConfig;
  crf?: number;
}

function resolveWindowLayout(timeline: {
  width: number;
  height: number;
  screen?: { width: number; height: number };
  window?: TimelineWindowConfig;
}): {
  screenW: number;
  screenH: number;
  vpW: number;
  vpH: number;
  titlebarH: number;
  borderRadius: number;
  winX: number;
  winY: number;
  contentX: number;
  contentY: number;
  hasChrome: boolean;
} {
  const vpW = timeline.width;
  const vpH = timeline.height;
  const screen = timeline.screen;
  if (!screen) {
    return {
      screenW: vpW,
      screenH: vpH,
      vpW,
      vpH,
      titlebarH: 0,
      borderRadius: 0,
      winX: 0,
      winY: 0,
      contentX: 0,
      contentY: 0,
      hasChrome: false,
    };
  }

  const screenW = screen.width;
  const screenH = screen.height;
  const wc = timeline.window;
  const titlebarVisible = wc?.titlebar?.visible ?? false;
  const titlebarH = titlebarVisible ? (wc?.titlebar?.height ?? 36) : 0;
  const borderRadius = wc?.borderRadius ?? (titlebarVisible ? 10 : 0);
  const windowTotalH = vpH + titlebarH;

  let winX: number;
  let winY: number;
  if (wc?.position && typeof wc.position === "object" && "x" in wc.position) {
    winX = wc.position.x;
    winY = wc.position.y;
  } else {
    winX = Math.round((screenW - vpW) / 2);
    winY = Math.round((screenH - windowTotalH) / 2);
  }

  return {
    screenW,
    screenH,
    vpW,
    vpH,
    titlebarH,
    borderRadius,
    winX,
    winY,
    contentX: winX,
    contentY: winY + titlebarH,
    hasChrome: true,
  };
}

function findFont(): string | undefined {
  const candidates = [
    "/System/Library/Fonts/SFNSMono.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf",
  ];
  for (const f of candidates) {
    try {
      accessSync(f);
      return f;
    } catch {
      continue;
    }
  }
  return undefined;
}

function buildNativeWindowConfig(
  wc: TimelineWindowConfig | undefined,
  hasChrome: boolean,
) {
  if (!hasChrome) return undefined;
  return {
    titlebar_visible: wc?.titlebar?.visible,
    titlebar_title: wc?.titlebar?.title,
    titlebar_stoplight: wc?.titlebar?.stoplight,
    titlebar_height: wc?.titlebar?.height,
    titlebar_background: wc?.titlebar?.background,
    border_radius: wc?.borderRadius,
    shadow_blur:
      typeof wc?.shadow === "object" ? wc.shadow.blur : wc?.shadow !== false ? 40 : 0,
    shadow_offset_y: typeof wc?.shadow === "object" ? wc.shadow.offsetY : 10,
  };
}

function writeCursorSvg(
  workDir: string,
  cursorSvg: string,
  cursorSize: number,
  zoom: number,
): { path: string; size: number } {
  const scaledSize = Math.round(cursorSize * zoom);
  const svgWithSize = cursorSvg
    .replace(/width="[^"]*"/, `width="${scaledSize}"`)
    .replace(/height="[^"]*"/, `height="${scaledSize}"`);
  const svgPath = resolve(workDir, `_cursor_${Date.now()}.svg`);
  writeFileSync(svgPath, svgWithSize);
  return { path: svgPath, size: scaledSize };
}

export async function prepareStreamCompositor(
  timelineData: Pick<
    TimelineData,
    "fps" | "width" | "height" | "zoom" | "screen" | "window" | "background" | "theme"
  >,
  outputPath: string,
  options?: { crf?: number; sfx?: SfxConfig },
): Promise<import("@webreel/compositor").StreamCompositor | null> {
  if (!nativeCompositor?.isAvailable()) return null;

  const { StreamCompositor } = nativeCompositor as typeof import("@webreel/compositor");
  if (!StreamCompositor) return null;

  const ffmpegPath = await ensureFfmpeg();
  const crf = options?.crf ?? 18;
  const zoom = timelineData.zoom ?? 1;

  const workDir = resolve(homedir(), ".webreel");
  mkdirSync(workDir, { recursive: true });

  const cursor = writeCursorSvg(
    workDir,
    timelineData.theme.cursorSvg,
    timelineData.theme.cursorSize,
    zoom,
  );

  const layout = resolveWindowLayout(timelineData);
  const hasHud = true;
  const fontPath = hasHud ? findFont() : undefined;

  return new StreamCompositor({
    outputPath,
    config: {
      fps: timelineData.fps,
      width: timelineData.width,
      height: timelineData.height,
      zoom: timelineData.zoom,
      screen_width: timelineData.screen?.width ?? null,
      screen_height: timelineData.screen?.height ?? null,
      window: buildNativeWindowConfig(timelineData.window, layout.hasChrome),
      background: timelineData.background
        ? { color: timelineData.background.color }
        : undefined,
      hud_font_size: timelineData.theme.hud.fontSize,
      hud_border_radius: timelineData.theme.hud.borderRadius,
      hud_position: timelineData.theme.hud.position,
    },
    cursorSvgPath: cursor.path,
    cursorSize: cursor.size,
    fontPath,
    ffmpegPath,
    crf,
  });
}

export async function compose(
  cleanVideoPath: string,
  timelineData: TimelineData,
  outputPath: string,
  options?: ComposeOptions,
): Promise<void> {
  if (!nativeCompositor?.isAvailable()) {
    throw new Error(
      "Native compositor is required but not available. " +
        "Run 'zig build -Doptimize=ReleaseFast' in packages/@webreel/compositor.",
    );
  }

  const ffmpegPath = await ensureFfmpeg();
  const sfx = options?.sfx;
  const crf = options?.crf ?? 18;
  const zoom = timelineData.zoom ?? 1;

  const workDir = resolve(homedir(), ".webreel");
  mkdirSync(workDir, { recursive: true });
  const tempComposed = resolve(workDir, `_composed_${Date.now()}.mp4`);

  const cursor = writeCursorSvg(
    workDir,
    timelineData.theme.cursorSvg,
    timelineData.theme.cursorSize,
    zoom,
  );

  const layout = resolveWindowLayout(timelineData);
  const wc = timelineData.window;
  const bgc = timelineData.background;
  const hasHud = timelineData.frames.some((f) => f.hud?.labels.length);
  const fontPath = hasHud ? findFont() : undefined;

  try {
    await nativeCompositor.compose({
      inputPath: cleanVideoPath,
      outputPath: tempComposed,
      timeline: {
        fps: timelineData.fps,
        width: timelineData.width,
        height: timelineData.height,
        zoom: timelineData.zoom,
        screen: timelineData.screen,
        window: buildNativeWindowConfig(wc, layout.hasChrome),
        background: bgc ? { color: bgc.color } : undefined,
        hud_font_size: timelineData.theme.hud.fontSize,
        hud_border_radius: timelineData.theme.hud.borderRadius,
        hud_position: timelineData.theme.hud.position,
        frames: timelineData.frames,
      },
      cursorSvgPath: cursor.path,
      cursorSize: cursor.size,
      fontPath,
      ffmpegPath,
      crf,
    });
  } finally {
    rmSync(cursor.path, { force: true });
  }

  try {
    const ext = extname(outputPath).toLowerCase();
    const durationSec = timelineData.frames.length / timelineData.fps;
    const outputW = layout.hasChrome ? layout.screenW : timelineData.width;

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
      finalizeGif(ffmpegPath, tempComposed, outputPath, outputW);
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
