import { rmSync } from "node:fs";
import { moveFileSync } from "./fs.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SoundEvent } from "./types.js";
import { runFfmpegSync } from "./ffmpeg-run.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ASSETS_DIR = resolve(__dirname, "..", "assets");

export interface SfxConfig {
  click?: 1 | 2 | 3 | 4 | string;
  key?: 1 | 2 | 3 | 4 | string;
}

export function resolveSfxPath(
  value: 1 | 2 | 3 | 4 | string | undefined,
  prefix: "click" | "key",
): string {
  if (value === undefined) return resolve(ASSETS_DIR, `${prefix}-1.mp3`);
  if (typeof value === "string") return value;
  return resolve(ASSETS_DIR, `${prefix}-${value}.mp3`);
}

export function ensureSoundAssets(sfx?: SfxConfig): {
  clickPath: string;
  keyPath: string;
} {
  return {
    clickPath: resolveSfxPath(sfx?.click, "click"),
    keyPath: resolveSfxPath(sfx?.key, "key"),
  };
}

export function buildAudioMixArgs(
  videoInput: string,
  events: SoundEvent[],
  durationSec: number,
  sfx?: SfxConfig,
): { inputArgs: string[]; filterComplex: string } {
  const { clickPath, keyPath } = ensureSoundAssets(sfx);
  const inputArgs = [
    "-i",
    videoInput,
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=44100:cl=mono`,
    "-t",
    durationSec.toFixed(3),
  ];
  const filterParts: string[] = [];
  const durationMs = Math.round(durationSec * 1000);

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const soundFile = ev.type === "click" ? clickPath : keyPath;
    const delayMs = Math.min(ev.timeMs, durationMs);
    inputArgs.push("-i", soundFile);
    const baseVol = ev.type === "click" ? 0.25 : 0.15;
    const vol = baseVol + Math.random() * baseVol * 0.6;
    const rate = 44100 * (0.93 + Math.random() * 0.14);
    filterParts.push(
      `[${i + 2}]asetrate=${Math.round(rate)},aresample=44100,adelay=${delayMs}|${delayMs},volume=${vol.toFixed(3)}[s${i}]`,
    );
  }

  const mixInputs = "[1]" + events.map((_, i) => `[s${i}]`).join("");
  filterParts.push(`${mixInputs}amix=inputs=${events.length + 1}:normalize=0[aout]`);

  return { inputArgs, filterComplex: filterParts.join(";") };
}

export interface FinalizeMp4Options {
  remux?: boolean;
  sfx?: SfxConfig;
}

export function finalizeMp4(
  ffmpegPath: string,
  tempVideo: string,
  outputPath: string,
  events: SoundEvent[],
  durationSec: number,
  options?: FinalizeMp4Options,
): void {
  if (events.length === 0 || !options?.sfx) {
    if (options?.remux) {
      runFfmpegSync(
        ffmpegPath,
        ["-y", "-i", tempVideo, "-c", "copy", "-movflags", "+faststart", outputPath],
        "ffmpeg remux",
      );
    } else {
      moveFileSync(tempVideo, outputPath);
    }
    return;
  }

  const { inputArgs, filterComplex } = buildAudioMixArgs(
    tempVideo,
    events,
    durationSec,
    options.sfx,
  );

  runFfmpegSync(
    ffmpegPath,
    [
      "-y",
      ...inputArgs,
      "-filter_complex",
      filterComplex,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    "ffmpeg mp4 audio mix",
  );
}

export function finalizeWebm(
  ffmpegPath: string,
  tempVideo: string,
  outputPath: string,
  events: SoundEvent[],
  durationSec: number,
  sfx?: SfxConfig,
): void {
  const silentWebm = tempVideo + "_silent.webm";

  runFfmpegSync(
    ffmpegPath,
    [
      "-y",
      "-i",
      tempVideo,
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "30",
      "-b:v",
      "0",
      "-pix_fmt",
      "yuv420p",
      silentWebm,
    ],
    "ffmpeg webm encode",
  );

  if (events.length === 0 || !sfx) {
    moveFileSync(silentWebm, outputPath);
    return;
  }

  try {
    const { inputArgs, filterComplex } = buildAudioMixArgs(
      silentWebm,
      events,
      durationSec,
      sfx,
    );

    runFfmpegSync(
      ffmpegPath,
      [
        "-y",
        ...inputArgs,
        "-filter_complex",
        filterComplex,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "libopus",
        "-b:a",
        "128k",
        "-shortest",
        outputPath,
      ],
      "ffmpeg webm audio mix",
    );
  } finally {
    rmSync(silentWebm, { force: true });
  }
}

export function extractThumbnail(
  ffmpegPath: string,
  videoPath: string,
  outputPath: string,
  timeSec: number,
): void {
  runFfmpegSync(
    ffmpegPath,
    ["-y", "-ss", String(timeSec), "-i", videoPath, "-frames:v", "1", outputPath],
    "ffmpeg thumbnail extract",
  );
}

export const GIF_FPS = 15;
export const GIF_BAYER_SCALE = 5;

/**
 * Shared GIF quality filter graph: downsample to GIF_FPS, scale to the
 * target width with lanczos, then generate a full-stats palette and apply
 * bayer dithering when quantizing to it. Used both when finalizing a raw GIF
 * recording directly and when compositing overlays onto a GIF output.
 */
export function buildGifFilter(width: number, fps: number = GIF_FPS): string {
  return `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${GIF_BAYER_SCALE}`;
}

export function finalizeGif(
  ffmpegPath: string,
  tempVideo: string,
  outputPath: string,
  width: number,
): void {
  runFfmpegSync(
    ffmpegPath,
    ["-y", "-i", tempVideo, "-vf", buildGifFilter(width), outputPath],
    "ffmpeg gif encode",
  );
}
