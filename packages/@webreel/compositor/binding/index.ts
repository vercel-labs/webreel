import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Writable } from "node:stream";

export interface NativeComposeOptions {
  inputPath: string;
  outputPath: string;
  timeline: ComposeTimeline;
  cursorPngPath?: string;
  cursorSvgPath?: string;
  cursorSize?: number;
  fontPath?: string;
  ffmpegPath?: string;
  crf?: number;
  backend?: "auto" | "cpu" | "gpu";
}

export interface ComposeTimeline {
  fps: number;
  width: number;
  height: number;
  zoom?: number;
  screen?: { width: number; height: number };
  window?: {
    titlebar_visible?: boolean;
    titlebar_title?: string;
    titlebar_stoplight?: boolean;
    titlebar_height?: number;
    titlebar_background?: string;
    border_radius?: number;
    shadow_blur?: number;
    shadow_offset_y?: number;
  };
  background?: {
    color?: string;
  };
  hud_font_size?: number;
  hud_border_radius?: number;
  hud_position?: "top" | "bottom";
  frames: Array<{
    cursor: { x: number; y: number; scale: number };
    hud: { labels: string[] } | null;
  }>;
}

function findPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return dirname(fileURLToPath(import.meta.url));
}

function getCompositorBinaryPath(): string {
  const root = findPackageRoot();

  const candidates = [
    resolve(root, "zig-out", "bin", "compositor"),
    resolve(root, "zig-out", "bin", "compositor.exe"),
    resolve(root, "zig-out", "bin", "webreel"),
    resolve(root, "zig-out", "bin", "webreel.exe"),
  ];

  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir) {
    candidates.push(
      resolve(homeDir, ".webreel", "bin", "webreel"),
      resolve(homeDir, ".webreel", "bin", "webreel.exe"),
    );
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    `Native compositor binary not found. Run 'zig build -Doptimize=ReleaseFast' in ${root}`,
  );
}

function tempPath(prefix: string, ext: string): string {
  const id = randomBytes(8).toString("hex");
  return resolve(tmpdir(), `${prefix}-${id}${ext}`);
}

export function isAvailable(): boolean {
  try {
    getCompositorBinaryPath();
    return true;
  } catch {
    return false;
  }
}

export async function compose(opts: NativeComposeOptions): Promise<void> {
  const binPath = getCompositorBinaryPath();
  const timelinePath = tempPath("webreel-timeline", ".json");

  const timelineJson = {
    fps: opts.timeline.fps,
    width: opts.timeline.width,
    height: opts.timeline.height,
    zoom: opts.timeline.zoom ?? 1,
    screen_width: opts.timeline.screen?.width ?? null,
    screen_height: opts.timeline.screen?.height ?? null,
    window: opts.timeline.window ?? null,
    background: opts.timeline.background ?? null,
    hud_font_size: opts.timeline.hud_font_size ?? 16,
    hud_border_radius: opts.timeline.hud_border_radius ?? 8,
    hud_position: opts.timeline.hud_position ?? "bottom",
    frames: opts.timeline.frames,
  };

  writeFileSync(timelinePath, JSON.stringify(timelineJson));

  try {
    const args: string[] = [
      "--input",
      opts.inputPath,
      "--output",
      opts.outputPath,
      "--timeline",
      timelinePath,
      "--crf",
      String(opts.crf ?? 18),
    ];

    if (opts.cursorPngPath) {
      args.push("--cursor", opts.cursorPngPath);
    }

    if (opts.cursorSvgPath) {
      args.push("--cursor-svg", opts.cursorSvgPath);
    }

    if (opts.cursorSize) {
      args.push("--cursor-size", String(opts.cursorSize));
    }

    if (opts.fontPath) {
      args.push("--font", opts.fontPath);
    }

    if (opts.ffmpegPath) {
      args.push("--ffmpeg", opts.ffmpegPath);
    }

    if (opts.backend && opts.backend !== "auto") {
      args.push("--backend", opts.backend);
    }

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const proc = spawn(binPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const stderrChunks: Buffer[] = [];
      proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      proc.stdout?.on("data", () => {
        // consume stdout to prevent backpressure
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
        } else {
          const stderr = Buffer.concat(stderrChunks).toString().slice(-2000);
          rejectPromise(
            new Error(
              `Native compositor exited with code ${code}${stderr ? `:\n${stderr}` : ""}`,
            ),
          );
        }
      });

      proc.on("error", (err) => {
        rejectPromise(new Error(`Failed to spawn native compositor: ${err.message}`));
      });
    });
  } finally {
    try {
      unlinkSync(timelinePath);
    } catch {
      // ignore cleanup errors
    }
  }
}

export interface StreamConfig {
  fps: number;
  width: number;
  height: number;
  zoom?: number;
  screen_width?: number | null;
  screen_height?: number | null;
  window?: ComposeTimeline["window"] | null;
  background?: ComposeTimeline["background"] | null;
  hud_font_size?: number;
  hud_border_radius?: number;
  hud_position?: "top" | "bottom";
}

export interface StreamOptions {
  outputPath: string;
  config: StreamConfig;
  cursorPngPath?: string;
  cursorSvgPath?: string;
  cursorSize?: number;
  fontPath?: string;
  ffmpegPath?: string;
  crf?: number;
  backend?: "auto" | "cpu" | "gpu";
}

const STREAM_MAGIC = Buffer.from("WRST");

export class StreamCompositor {
  private proc: ChildProcess;
  private stderrChunks: Buffer[] = [];
  private stdin: Writable;
  private drainResolve: (() => void) | null = null;
  private finished = false;
  private closePromise: Promise<void>;

  constructor(opts: StreamOptions) {
    const binPath = getCompositorBinaryPath();
    const args = ["--mode", "stream", "--output", opts.outputPath];

    if (opts.cursorPngPath) args.push("--cursor", opts.cursorPngPath);
    if (opts.cursorSvgPath) args.push("--cursor-svg", opts.cursorSvgPath);
    if (opts.cursorSize) args.push("--cursor-size", String(opts.cursorSize));
    if (opts.fontPath) args.push("--font", opts.fontPath);
    if (opts.ffmpegPath) args.push("--ffmpeg", opts.ffmpegPath);
    args.push("--crf", String(opts.crf ?? 18));
    if (opts.backend && opts.backend !== "auto") {
      args.push("--backend", opts.backend);
    }

    this.proc = spawn(binPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.stdin = this.proc.stdin!;
    this.proc.stderr?.on("data", (c: Buffer) => this.stderrChunks.push(c));
    this.stdin.on("drain", () => {
      const r = this.drainResolve;
      if (r) {
        this.drainResolve = null;
        r();
      }
    });

    this.closePromise = new Promise<void>((resolvePromise, rejectPromise) => {
      this.proc.on("close", (code) => {
        if (code === 0) resolvePromise();
        else {
          const stderr = Buffer.concat(this.stderrChunks).toString().slice(-2000);
          rejectPromise(
            new Error(
              `Stream compositor exited with code ${code}${stderr ? `:\n${stderr}` : ""}`,
            ),
          );
        }
      });
      this.proc.on("error", rejectPromise);
    });

    const configJson = Buffer.from(
      JSON.stringify({
        fps: opts.config.fps,
        width: opts.config.width,
        height: opts.config.height,
        zoom: opts.config.zoom ?? 1,
        screen_width: opts.config.screen_width ?? null,
        screen_height: opts.config.screen_height ?? null,
        window: opts.config.window ?? null,
        background: opts.config.background ?? null,
        hud_font_size: opts.config.hud_font_size ?? 16,
        hud_border_radius: opts.config.hud_border_radius ?? 8,
        hud_position: opts.config.hud_position ?? "bottom",
      }),
    );

    const header = Buffer.alloc(STREAM_MAGIC.length + 4 + configJson.length);
    STREAM_MAGIC.copy(header, 0);
    header.writeUInt32LE(configJson.length, STREAM_MAGIC.length);
    configJson.copy(header, STREAM_MAGIC.length + 4);
    this.stdin.write(header);
  }

  writeFrame(
    jpegData: Buffer,
    cursor: { x: number; y: number; scale: number },
    hud: { labels: string[] } | null,
  ): boolean {
    const meta = Buffer.from(JSON.stringify({ cursor, hud }));
    const frameBuf = Buffer.alloc(4 + jpegData.length + 4 + meta.length);
    frameBuf.writeUInt32LE(jpegData.length, 0);
    jpegData.copy(frameBuf, 4);
    frameBuf.writeUInt32LE(meta.length, 4 + jpegData.length);
    meta.copy(frameBuf, 4 + jpegData.length + 4);
    return this.stdin.write(frameBuf);
  }

  waitForDrain(): Promise<void> {
    if (!this.stdin.writableNeedDrain) return Promise.resolve();
    return new Promise((res) => {
      this.drainResolve = res;
    });
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;

    const endBuf = Buffer.alloc(4);
    endBuf.writeUInt32LE(0, 0);
    this.stdin.write(endBuf);
    this.stdin.end();

    return this.closePromise;
  }

  kill(): void {
    if (this.finished) return;
    this.finished = true;
    try {
      this.proc.kill("SIGKILL");
    } catch {
      // process may have already exited
    }
  }
}
