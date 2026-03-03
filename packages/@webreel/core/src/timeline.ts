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
      blur: number;
      border: string;
      shadow: string;
      keyBackground: string;
      keyBorder: string;
      keyBorderRadius: number;
      keyPadding: string;
    };
  };
  frames: FrameData[];
  events: SoundEvent[];
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
      blur: options?.hud?.blur ?? DEFAULT_HUD_THEME.blur,
      border: options?.hud?.border ?? DEFAULT_HUD_THEME.border,
      shadow: options?.hud?.shadow ?? DEFAULT_HUD_THEME.shadow,
      keyBackground: options?.hud?.keyBackground ?? DEFAULT_HUD_THEME.keyBackground,
      keyBorder: options?.hud?.keyBorder ?? DEFAULT_HUD_THEME.keyBorder,
      keyBorderRadius: options?.hud?.keyBorderRadius ?? DEFAULT_HUD_THEME.keyBorderRadius,
      keyPadding: options?.hud?.keyPadding ?? DEFAULT_HUD_THEME.keyPadding,
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

  getEvents(): SoundEvent[] {
    return this.events;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getCursorPosition(): Point {
    return { x: this.currentCursor.x, y: this.currentCursor.y };
  }

  getCursorScale(): number {
    return this.currentCursor.scale;
  }

  isMoving(): boolean {
    return this.cursorPath !== null && this.pathIndex < this.cursorPath.length;
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
