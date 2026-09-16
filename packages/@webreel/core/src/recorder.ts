import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, extname } from "node:path";
import { TARGET_FPS, DEFAULT_VIEWPORT_SIZE } from "./types.js";
import type { CDPClient, SoundEvent } from "./types.js";
import type { RecordingContext } from "./actions.js";
import { ensureFfmpeg } from "./ffmpeg.js";
import { finalizeMp4, finalizeWebm, finalizeGif, type SfxConfig } from "./media.js";
import type { InteractionTimeline, TimelineData } from "./timeline.js";

export interface FrameSink {
  writeFrame(
    jpegData: Buffer,
    cursor: { x: number; y: number; scale: number },
    hud: { labels: string[] } | null,
  ): boolean;
  waitForDrain(): Promise<void>;
  finish(): Promise<void>;
  kill(): void;
}

export class Recorder {
  private outputPath = "";
  private frameCount = 0;
  private running = false;
  private capturePromise: Promise<void> | null = null;
  private events: SoundEvent[] = [];
  private outputWidth: number;
  private outputHeight: number;
  private sfx: SfxConfig | undefined;
  private fps: number;
  private frameMs: number;
  private crf: number;
  private ffmpegPath = "ffmpeg";
  private ffmpegProcess: ChildProcess | null = null;
  private tempVideo = "";
  private drainResolve: (() => void) | null = null;
  private droppedFrames = 0;
  private timeline: InteractionTimeline | null = null;
  private ctx: RecordingContext | null = null;
  private framesDir: string | null = null;
  private stopResolve: (() => void) | null = null;
  private stoppedPromise: Promise<void> | null = null;
  private streamSink: FrameSink | null = null;
  private _composedInline = false;

  constructor(
    outputWidth = DEFAULT_VIEWPORT_SIZE,
    outputHeight = DEFAULT_VIEWPORT_SIZE,
    options?: { sfx?: SfxConfig; fps?: number; crf?: number; framesDir?: string },
  ) {
    this.outputWidth = outputWidth;
    this.outputHeight = outputHeight;
    this.sfx = options?.sfx;
    this.fps = options?.fps ?? TARGET_FPS;
    this.frameMs = 1000 / this.fps;
    this.crf = options?.crf ?? 18;
    if (options?.framesDir) {
      this.framesDir = options.framesDir;
      mkdirSync(this.framesDir, { recursive: true });
    }
  }

  setTimeline(timeline: InteractionTimeline): void {
    this.timeline = timeline;
  }

  getTimeline(): InteractionTimeline | null {
    return this.timeline;
  }

  getTimelineData(): TimelineData | null {
    return this.timeline?.toJSON() ?? null;
  }

  setStreamSink(sink: FrameSink, tempVideoPath?: string): void {
    this.streamSink = sink;
    if (tempVideoPath) this.tempVideo = tempVideoPath;
  }

  isComposedInline(): boolean {
    return this._composedInline;
  }

  addEvent(type: "click" | "key") {
    if (this.running) {
      const timeMs = (this.frameCount / this.fps) * 1000;
      this.events.push({ type, timeMs });
    }
  }

  async start(client: CDPClient, outputPath: string, ctx?: RecordingContext) {
    this.ffmpegPath = await ensureFfmpeg();
    this.outputPath = outputPath;
    this.frameCount = 0;
    this.droppedFrames = 0;
    this.running = true;
    this.events = [];
    this._composedInline = false;
    this.ctx = ctx ?? null;
    if (this.ctx) this.ctx.setRecorder(this);

    if (!this.streamSink) {
      const workDir = resolve(homedir(), ".webreel");
      mkdirSync(workDir, { recursive: true });
      this.tempVideo = resolve(workDir, `_rec_${Date.now()}.mp4`);
      this.ffmpegProcess = spawn(
        this.ffmpegPath,
        [
          "-y",
          "-f",
          "image2pipe",
          "-framerate",
          String(this.fps),
          "-c:v",
          "mjpeg",
          "-i",
          "pipe:0",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          String(this.crf),
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
          String(this.fps),
          this.tempVideo,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );

      const resolveDrain = () => {
        const resolve = this.drainResolve;
        if (resolve) {
          this.drainResolve = null;
          resolve();
        }
      };

      const stdin = this.ffmpegProcess.stdin;
      if (!stdin) throw new Error("ffmpeg process has no stdin pipe");
      stdin.on("drain", resolveDrain);
      this.ffmpegProcess.on("close", resolveDrain);
    }

    this.stoppedPromise = new Promise<void>((resolve) => {
      this.stopResolve = resolve;
    });

    this.capturePromise = this.captureLoop(client);
  }

  private async writeFrame(buffer: Buffer): Promise<void> {
    if (!this.running) return;
    const stdin = this.ffmpegProcess?.stdin;
    if (!stdin?.writable) {
      this.droppedFrames++;
      return;
    }
    const ok = stdin.write(buffer);
    if (!ok) {
      await new Promise<void>((res) => {
        if (this.drainResolve) {
          const prev = this.drainResolve;
          this.drainResolve = null;
          prev();
        }
        this.drainResolve = res;
      });
    }
  }

  private async emitFrame(buffer: Buffer): Promise<void> {
    if (!this.running) return;
    if (this.streamSink && this.timeline) {
      const frame = this.timeline.getLastFrame();
      if (frame) {
        const ok = this.streamSink.writeFrame(buffer, frame.cursor, frame.hud);
        if (!ok) await this.streamSink.waitForDrain();
      }
    } else {
      await this.writeFrame(buffer);
    }
  }

  private static readonly CAPTURE_TIMEOUT_MS = 200;

  private async raceStop<T>(promise: Promise<T>): Promise<T | null> {
    const stopped = this.stoppedPromise!.then((): null => null);
    const result = await Promise.race([promise, stopped]);
    return result;
  }

  private async captureLoop(client: CDPClient) {
    const startTime = Date.now();
    let consecutiveErrors = 0;
    let lastGoodFrame: Buffer | null = null;

    while (this.running) {
      let capturedBuffer: Buffer | null = null;

      try {
        if (!this.timeline) {
          const evalResult = await this.raceStop(
            client.Runtime.evaluate({
              expression: "window.__tickCursor&&window.__tickCursor()",
            }),
          );
          if (!evalResult) break;
        }

        const timeout = new Promise<"timeout">((r) =>
          setTimeout(() => r("timeout"), Recorder.CAPTURE_TIMEOUT_MS),
        );
        const result = await Promise.race([
          client.Page.captureScreenshot({ format: "jpeg", quality: 92 }),
          timeout,
          this.stoppedPromise!.then(() => "stopped" as const),
        ]);

        if (result === "stopped") break;

        if (result !== "timeout") {
          capturedBuffer = Buffer.from(result.data, "base64");
          lastGoodFrame = capturedBuffer;
          consecutiveErrors = 0;
        } else {
          consecutiveErrors++;
        }
      } catch {
        if (!this.running) break;
        consecutiveErrors++;
      }

      if (consecutiveErrors >= 600) {
        console.error(
          `Recording aborted after ${consecutiveErrors} consecutive capture failures`,
        );
        break;
      }

      const buffer = capturedBuffer ?? lastGoodFrame;
      if (buffer) {
        if (this.timeline) this.timeline.tick();
        const expectedFrames = Math.max(
          this.frameCount + 1,
          Math.round((Date.now() - startTime) / this.frameMs),
        );
        const framesNeeded = expectedFrames - this.frameCount;

        for (let i = 0; i < framesNeeded - 1; i++) {
          if (this.timeline) this.timeline.tick();
          await this.emitFrame(buffer);
          this.frameCount++;
        }

        await this.emitFrame(buffer);
        this.frameCount++;

        if (capturedBuffer && this.framesDir) {
          const padded = String(this.frameCount).padStart(5, "0");
          writeFileSync(resolve(this.framesDir, `frame-${padded}.jpg`), buffer);
        }
      } else {
        await new Promise((r) => setTimeout(r, this.frameMs));
      }
    }
  }

  getTempVideoPath(): string {
    return this.tempVideo;
  }

  async stop() {
    this.running = false;
    if (this.ctx) this.ctx.setRecorder(null);

    if (this.drainResolve) {
      this.drainResolve();
      this.drainResolve = null;
    }
    if (this.stopResolve) {
      this.stopResolve();
      this.stopResolve = null;
    }

    await this.capturePromise;

    if (this.droppedFrames > 0) {
      console.warn(`Warning: ${this.droppedFrames} frame(s) dropped during recording`);
    }

    if (this.streamSink) {
      try {
        await this.streamSink.finish();
      } catch (err) {
        console.error("Stream compositor error:", err);
      }
      this.streamSink = null;

      if (this.frameCount === 0) {
        rmSync(this.tempVideo, { force: true });
        return;
      }

      this._composedInline = true;
      const durationSec = this.frameCount / this.fps;
      const events = this.timeline?.getEvents() ?? this.events;
      const ext = extname(this.outputPath).toLowerCase();

      try {
        mkdirSync(resolve(this.outputPath, ".."), { recursive: true });
        if (ext === ".webm") {
          finalizeWebm(
            this.ffmpegPath,
            this.tempVideo,
            this.outputPath,
            events,
            durationSec,
            this.sfx,
          );
        } else if (ext === ".gif") {
          finalizeGif(this.ffmpegPath, this.tempVideo, this.outputPath, this.outputWidth);
        } else {
          finalizeMp4(
            this.ffmpegPath,
            this.tempVideo,
            this.outputPath,
            events,
            durationSec,
            { remux: true, sfx: this.sfx },
          );
        }
      } finally {
        rmSync(this.tempVideo, { force: true });
      }
      return;
    }

    if (this.ffmpegProcess) {
      const proc = this.ffmpegProcess;
      const FFMPEG_CLOSE_TIMEOUT_MS = 10_000;
      const killTimer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // Process may have already exited
        }
      }, FFMPEG_CLOSE_TIMEOUT_MS);
      await new Promise<void>((res) => {
        if (proc.exitCode !== null) {
          res();
          return;
        }
        proc.once("close", () => res());
        try {
          proc.stdin?.end();
        } catch (err) {
          console.warn("Failed to close ffmpeg stdin:", err);
          res();
        }
      });
      clearTimeout(killTimer);
      this.ffmpegProcess = null;
    }

    if (this.frameCount === 0) {
      rmSync(this.tempVideo, { force: true });
      return;
    }

    if (this.timeline) {
      return;
    }

    try {
      const durationSec = this.frameCount / this.fps;
      const ext = extname(this.outputPath).toLowerCase();

      if (ext === ".webm") {
        finalizeWebm(
          this.ffmpegPath,
          this.tempVideo,
          this.outputPath,
          this.events,
          durationSec,
          this.sfx,
        );
      } else if (ext === ".gif") {
        finalizeGif(this.ffmpegPath, this.tempVideo, this.outputPath, this.outputWidth);
      } else {
        finalizeMp4(
          this.ffmpegPath,
          this.tempVideo,
          this.outputPath,
          this.events,
          durationSec,
          { sfx: this.sfx },
        );
      }
    } finally {
      rmSync(this.tempVideo, { force: true });
    }
  }
}
