import { writeFileSync } from "node:fs";
import type { Point, SoundEvent } from "./types.js";
import type { ZoomEvent } from "./autozoom.js";
import {
  TARGET_FPS,
  DEFAULT_CURSOR_SVG,
  DEFAULT_VIEWPORT_SIZE,
  OFFSCREEN_MARGIN,
  DEFAULT_CURSOR_SIZE,
  DEFAULT_HUD_THEME,
} from "./types.js";

interface CursorState {
  x: number;
  y: number;
  scale: number;
}

interface HudState {
  labels: string[];
}

interface FrameData {
  cursor: CursorState;
  hud: HudState | null;
}

export interface TimelineData {
  fps: number;
  width: number;
  height: number;
  zoom: number;
  theme: {
    cursorSvg: string;
    cursorSize: number;
    cursorHotspot: "top-left" | "center";
    hud: {
      background: string;
      color: string;
      fontSize: number;
      fontFamily: string;
      borderRadius: number;
      position: "top" | "bottom";
    };
  };
  frames: FrameData[];
  events: SoundEvent[];
  zoomEvents?: ZoomEvent[];
}

export class InteractionTimeline {
  private cursorPath: Point[] | null = null;
  private pathIndex = 0;
  private currentCursor: CursorState = {
    x: -OFFSCREEN_MARGIN,
    y: -OFFSCREEN_MARGIN,
    scale: 1,
  };
  private currentHud: HudState | null = null;
  private frames: FrameData[] = [];
  private events: SoundEvent[] = [];
  private frameCount = 0;
  private tickResolvers: Array<() => void> = [];
  private pathCompleteResolvers: Array<() => void> = [];

  private width: number;
  private height: number;
  private zoom: number;
  private fps: number;
  private cursorSvg: string;
  private cursorSize: number;
  private cursorHotspot: "top-left" | "center";
  private hudConfig: TimelineData["theme"]["hud"];

  constructor(
    width = DEFAULT_VIEWPORT_SIZE,
    height = DEFAULT_VIEWPORT_SIZE,
    options?: {
      zoom?: number;
      fps?: number;
      initialCursor?: { x: number; y: number };
      cursorSvg?: string;
      cursorSize?: number;
      cursorHotspot?: "top-left" | "center";
      hud?: Partial<TimelineData["theme"]["hud"]>;
      loadedFrames?: FrameData[];
      loadedEvents?: SoundEvent[];
    },
  ) {
    this.width = width;
    this.height = height;
    this.zoom = options?.zoom ?? 1;
    this.fps = options?.fps ?? TARGET_FPS;
    if (options?.initialCursor) {
      this.currentCursor = {
        x: options.initialCursor.x,
        y: options.initialCursor.y,
        scale: 1,
      };
    }
    this.cursorSvg = options?.cursorSvg ?? DEFAULT_CURSOR_SVG;
    this.cursorSize = options?.cursorSize ?? DEFAULT_CURSOR_SIZE;
    this.cursorHotspot = options?.cursorHotspot ?? "top-left";
    this.hudConfig = {
      background: options?.hud?.background ?? DEFAULT_HUD_THEME.background,
      color: options?.hud?.color ?? DEFAULT_HUD_THEME.color,
      fontSize: options?.hud?.fontSize ?? DEFAULT_HUD_THEME.fontSize,
      fontFamily: options?.hud?.fontFamily ?? DEFAULT_HUD_THEME.fontFamily,
      borderRadius: options?.hud?.borderRadius ?? DEFAULT_HUD_THEME.borderRadius,
      position: options?.hud?.position ?? DEFAULT_HUD_THEME.position,
    };
    if (options?.loadedFrames) {
      this.frames = options.loadedFrames;
      this.frameCount = options.loadedFrames.length;
    }
    if (options?.loadedEvents) {
      this.events = options.loadedEvents;
    }
  }

  setCursorPath(positions: Point[]): void {
    this.cursorPath = positions;
    this.pathIndex = 0;
  }

  setCursorScale(scale: number): void {
    this.currentCursor.scale = scale;
  }

  showHud(labels: string[]): void {
    this.currentHud = { labels };
  }

  hideHud(): void {
    this.currentHud = null;
  }

  addEvent(type: "click" | "key"): void {
    const timeMs = (this.frameCount / this.fps) * 1000;
    this.events.push({ type, timeMs });
  }

  waitForNextTick(): Promise<void> {
    return new Promise((resolve) => {
      this.tickResolvers.push(resolve);
    });
  }

  // Resolves when the current cursorPath is fully consumed. If no path is
  // active, resolves immediately. Used by animateMoveTo to fire the next
  // action (e.g. a click) exactly when the cursor arrives at its target —
  // regardless of capture rate, tickDuplicate cadence, or hardware speed.
  waitForPathComplete(): Promise<void> {
    if (this.cursorPath === null) return Promise.resolve();
    return new Promise((resolve) => {
      this.pathCompleteResolvers.push(resolve);
    });
  }

  private maybeResolvePathComplete(): void {
    if (this.cursorPath !== null || this.pathCompleteResolvers.length === 0) return;
    const resolvers = this.pathCompleteResolvers;
    this.pathCompleteResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  tick(): void {
    if (this.cursorPath && this.pathIndex < this.cursorPath.length) {
      const p = this.cursorPath[this.pathIndex++];
      this.currentCursor.x = p.x;
      this.currentCursor.y = p.y;
      if (this.pathIndex >= this.cursorPath.length) {
        this.cursorPath = null;
      }
    }

    this.pushCurrentState();

    const resolvers = this.tickResolvers;
    this.tickResolvers = [];
    for (const resolve of resolvers) resolve();

    this.maybeResolvePathComplete();
  }

  tickDuplicate(): void {
    // Advance the cursor along the precomputed path on duplicate slots, so
    // every 60fps output frame shows a unique cursor position even when the
    // underlying screenshot is repeated. Without this, cursor motion runs at
    // the capture rate (~28fps) in a 60fps container, producing visible stutter.
    //
    // Critical: do NOT fire tickResolvers here — those gate action timing
    // (e.g. typeText inter-keystroke cadence via waitForNextTick) on REAL
    // captured frames. Only the real `tick()` resolves them.
    // `pathCompleteResolvers` DO fire here though — a path that exhausts on
    // a duplicate slot is just as arrived as one that exhausts on a real tick.
    if (this.cursorPath && this.pathIndex < this.cursorPath.length) {
      const p = this.cursorPath[this.pathIndex++];
      this.currentCursor.x = p.x;
      this.currentCursor.y = p.y;
      if (this.pathIndex >= this.cursorPath.length) {
        this.cursorPath = null;
      }
    }
    this.pushCurrentState();

    this.maybeResolvePathComplete();
  }

  private pushCurrentState(): void {
    this.frames.push({
      cursor: { ...this.currentCursor },
      hud: this.currentHud ? { labels: [...this.currentHud.labels] } : null,
    });
    this.frameCount++;
  }

  getEvents(): SoundEvent[] {
    return this.events;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  toJSON(): TimelineData {
    return {
      fps: this.fps,
      width: this.width,
      height: this.height,
      zoom: this.zoom,
      theme: {
        cursorSvg: this.cursorSvg,
        cursorSize: this.cursorSize,
        cursorHotspot: this.cursorHotspot,
        hud: this.hudConfig,
      },
      frames: this.frames,
      events: this.events,
    };
  }

  save(path: string): void {
    writeFileSync(path, JSON.stringify(this.toJSON()));
  }

  static load(json: TimelineData): InteractionTimeline {
    return new InteractionTimeline(json.width, json.height, {
      zoom: json.zoom,
      fps: json.fps,
      cursorSvg: json.theme.cursorSvg,
      cursorSize: json.theme.cursorSize,
      cursorHotspot: json.theme.cursorHotspot,
      hud: json.theme.hud,
      loadedFrames: json.frames,
      loadedEvents: json.events,
    });
  }
}
