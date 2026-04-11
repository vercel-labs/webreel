import { writeFileSync } from "node:fs";
import type { Point, SoundEvent } from "./types.js";
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

export interface TimelineWindowConfig {
  titlebar?: {
    visible?: boolean;
    title?: string;
    stoplight?: boolean;
    height?: number;
    background?: string;
  };
  borderRadius?: number;
  shadow?:
    | boolean
    | {
        blur?: number;
        color?: string;
        offsetY?: number;
      };
  position?: "center" | { x: number; y: number };
}

export interface TimelineBackgroundConfig {
  type: "solid" | "gradient" | "image";
  color?: string;
  gradient?: { from: string; to: string; angle?: number };
  image?: string;
}

export interface TimelineData {
  fps: number;
  width: number;
  height: number;
  zoom: number;
  screen?: { width: number; height: number };
  window?: TimelineWindowConfig;
  background?: TimelineBackgroundConfig;
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
}

export class InteractionTimeline {
  private cursorPath: Point[] | null = null;
  private pathIndex = 0;
  private scalePath: number[] | null = null;
  private scalePathIndex = 0;
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

  private width: number;
  private height: number;
  private zoom: number;
  private fps: number;
  private cursorSvg: string;
  private cursorSize: number;
  private cursorHotspot: "top-left" | "center";
  private hudConfig: TimelineData["theme"]["hud"];
  private screen?: { width: number; height: number };
  private windowConfig?: TimelineWindowConfig;
  private backgroundConfig?: TimelineBackgroundConfig;

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
      screen?: { width: number; height: number };
      window?: TimelineWindowConfig;
      background?: TimelineBackgroundConfig;
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
    this.screen = options?.screen;
    this.windowConfig = options?.window;
    this.backgroundConfig = options?.background;
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

  setCursorScaleAnimated(targetScale: number, frames: number): void {
    const startScale = this.currentCursor.scale;
    const steps: number[] = [];
    for (let i = 1; i <= frames; i++) {
      const t = i / frames;
      const eased = 1 - (1 - t) * (1 - t);
      steps.push(startScale + (targetScale - startScale) * eased);
    }
    this.scalePath = steps;
    this.scalePathIndex = 0;
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

  tick(): void {
    if (this.cursorPath && this.pathIndex < this.cursorPath.length) {
      const p = this.cursorPath[this.pathIndex++];
      this.currentCursor.x = p.x;
      this.currentCursor.y = p.y;
      if (this.pathIndex >= this.cursorPath.length) {
        this.cursorPath = null;
      }
    }

    if (this.scalePath && this.scalePathIndex < this.scalePath.length) {
      this.currentCursor.scale = this.scalePath[this.scalePathIndex++];
      if (this.scalePathIndex >= this.scalePath.length) {
        this.scalePath = null;
      }
    }

    this.pushCurrentState();

    const resolvers = this.tickResolvers;
    this.tickResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  tickDuplicate(): void {
    this.pushCurrentState();
  }

  private pushCurrentState(): void {
    this.frames.push({
      cursor: { ...this.currentCursor },
      hud: this.currentHud ? { labels: [...this.currentHud.labels] } : null,
    });
    this.frameCount++;
  }

  getLastFrame(): { cursor: CursorState; hud: HudState | null } | null {
    if (this.frames.length === 0) return null;
    return this.frames[this.frames.length - 1];
  }

  get bufferedFrameCount(): number {
    return this.frames.length;
  }

  flushFrames(upTo: number): FrameData[] {
    return this.frames.splice(0, upTo);
  }

  getEvents(): SoundEvent[] {
    return this.events;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  toJSON(): TimelineData {
    const data: TimelineData = {
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
    if (this.screen) data.screen = this.screen;
    if (this.windowConfig) data.window = this.windowConfig;
    if (this.backgroundConfig) data.background = this.backgroundConfig;
    return data;
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
      screen: json.screen,
      window: json.window,
      background: json.background,
      loadedFrames: json.frames,
      loadedEvents: json.events,
    });
  }
}
