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
  private hasBeginFrameControl: boolean;

  constructor(
    outputWidth = DEFAULT_VIEWPORT_SIZE,
    outputHeight = DEFAULT_VIEWPORT_SIZE,
    options?: {
      sfx?: SfxConfig;
      fps?: number;
      crf?: number;
      framesDir?: string;
      hasBeginFrameControl?: boolean;
    },
  ) {
    this.outputWidth = outputWidth;
    this.outputHeight = outputHeight;
    this.sfx = options?.sfx;
    this.fps = options?.fps ?? TARGET_FPS;
    this.frameMs = 1000 / this.fps;
    this.crf = options?.crf ?? 18;
    this.hasBeginFrameControl = options?.hasBeginFrameControl ?? false;
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
    this.ctx = ctx ?? null;
    if (this.ctx) this.ctx.setRecorder(this);

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
        "ultrafast",
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

    this.stoppedPromise = new Promise<void>((resolve) => {
      this.stopResolve = resolve;
    });

    console.log(
      `[recorder] beginFrameControl=${this.hasBeginFrameControl} fps=${this.fps}`,
    );
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
        this.drainResolve = res;
      });
    }
  }

  private async raceStop<T>(promise: Promise<T>): Promise<T | null> {
    const stopped = this.stoppedPromise!.then((): null => null);
    const result = await Promise.race([promise, stopped]);
    return result;
  }

  private lastMouseX = -1;
  private lastMouseY = -1;
  private mouseThrottle = 0;

  private async captureLoop(client: CDPClient) {
    let lastFrameTime = Date.now();
    let consecutiveErrors = 0;
    let loopCount = 0;

    while (this.running) {
      try {
        loopCount++;
        if (this.timeline) {
          this.timeline.tick();
          const pos = this.timeline.getCursorPosition();
          const mx = Math.round(pos.x);
          const my = Math.round(pos.y);

          if (this.hasBeginFrameControl) {
            await client.Input.dispatchMouseEvent({
              type: "mouseMoved",
              x: mx,
              y: my,
            });
          } else {
            const moved = mx !== this.lastMouseX || my !== this.lastMouseY;
            this.mouseThrottle++;
            if (moved && this.mouseThrottle >= 3) {
              this.mouseThrottle = 0;
              this.lastMouseX = mx;
              this.lastMouseY = my;
              await client.Input.dispatchMouseEvent({
                type: "mouseMoved",
                x: mx,
                y: my,
              });
            }
          }
        } else {
          const evalResult = await this.raceStop(
            client.Runtime.evaluate({
              expression: "window.__tickCursor&&window.__tickCursor()",
            }),
          );
          if (!evalResult) break;
        }

        let buffer: Buffer;

        if (this.hasBeginFrameControl) {
          const bfResult = await this.raceStop(
            client.send("HeadlessExperimental.beginFrame", {
              interval: this.frameMs,
              screenshot: { format: "jpeg", quality: 60 },
            }) as Promise<{ hasDamage: boolean; screenshotData?: string }>,
          );
          if (!bfResult) break;
          if (!bfResult.screenshotData) continue;
          buffer = Buffer.from(bfResult.screenshotData, "base64");
        } else {
          const screenshotResult = await this.raceStop(
            client.Page.captureScreenshot({
              format: "jpeg",
              quality: 60,
              optimizeForSpeed: true,
            }),
          );
          if (!screenshotResult) break;
          buffer = Buffer.from(screenshotResult.data, "base64");
        }

        if (this.hasBeginFrameControl) {
          await this.writeFrame(buffer);
          this.frameCount++;
        } else {
          const now = Date.now();
          const elapsed = now - lastFrameTime;
          const frameSlots = Math.min(3, Math.max(1, Math.round(elapsed / this.frameMs)));
          if (frameSlots > 1) {
            for (let i = 0; i < frameSlots - 1; i++) {
              if (this.timeline) this.timeline.tickDuplicate();
              await this.writeFrame(buffer);
              this.frameCount++;
            }
          }
          await this.writeFrame(buffer);
          this.frameCount++;
          lastFrameTime = now;
        }

        if (this.framesDir) {
          const padded = String(this.frameCount).padStart(5, "0");
          writeFileSync(resolve(this.framesDir, `frame-${padded}.jpg`), buffer);
        }

        consecutiveErrors = 0;
      } catch (err) {
        if (!this.running) break;
        consecutiveErrors++;
        if (loopCount <= 15)
          console.error(
            `[recorder] loop ${loopCount}: error #${consecutiveErrors}:`,
            err,
          );
        if (consecutiveErrors >= 10) {
          console.error(
            `Recording aborted after ${consecutiveErrors} consecutive capture failures:`,
            err,
          );
          break;
        }
      }
    }
    console.log(
      `[recorder] captureLoop exited after ${loopCount} iterations, ${this.frameCount} frames`,
    );
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

    console.log(
      `[recorder] stopped: ${this.frameCount} frames, ${this.droppedFrames} dropped`,
    );

    if (this.frameCount === 0) {
      rmSync(this.tempVideo, { force: true });
      return;
    }

    // When a timeline is set, the caller is responsible for the temp video
    // (e.g. renaming it for later compositing). Don't delete or finalize it.
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
