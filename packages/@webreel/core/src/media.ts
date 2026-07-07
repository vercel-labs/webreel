import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { moveFileSync } from "./fs.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SoundEvent } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function runFfmpeg(ffmpegPath: string, args: string[]): void {
  const result = spawnSync(ffmpegPath, args, {
    stdio: "pipe",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().slice(-2000) ?? "";
    throw new Error(
      `ffmpeg exited with code ${result.status}${stderr ? `:\n${stderr}` : ""}`,
    );
  }
}

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
      runFfmpeg(ffmpegPath, [
        "-y",
        "-i",
        tempVideo,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
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

  runFfmpeg(ffmpegPath, [
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
  ]);
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

  runFfmpeg(ffmpegPath, [
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
  ]);

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

    runFfmpeg(ffmpegPath, [
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
    ]);
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
  runFfmpeg(ffmpegPath, [
    "-y",
    "-ss",
    String(timeSec),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    outputPath,
  ]);
}

export function finalizeGif(
  ffmpegPath: string,
  tempVideo: string,
  outputPath: string,
  width: number,
): void {
  runFfmpeg(ffmpegPath, [
    "-y",
    "-i",
    tempVideo,
    "-vf",
    `fps=15,scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
    outputPath,
  ]);
}
