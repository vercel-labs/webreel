export type CDPClient = {
  close: () => Promise<void>;
  Runtime: {
    enable: () => Promise<void>;
    evaluate: (params: {
      expression: string;
      returnByValue?: boolean;
      awaitPromise?: boolean;
    }) => Promise<{ result: { value?: unknown } }>;
  };
  Page: {
    enable: () => Promise<void>;
    navigate: (params: { url: string }) => Promise<void>;
    loadEventFired: () => Promise<void>;
    captureScreenshot: (params: {
      format?: string;
      quality?: number;
      optimizeForSpeed?: boolean;
    }) => Promise<{ data: string }>;
  };
  Input: {
    dispatchMouseEvent: (params: {
      type: string;
      x: number;
      y: number;
      button?: string;
      buttons?: number;
      clickCount?: number;
      modifiers?: number;
    }) => Promise<void>;
    dispatchKeyEvent: (params: {
      type: string;
      key?: string;
      code?: string;
      text?: string;
      windowsVirtualKeyCode?: number;
      modifiers?: number;
      commands?: string[];
    }) => Promise<void>;
  };
  Emulation: {
    setDeviceMetricsOverride: (params: {
      width: number;
      height: number;
      deviceScaleFactor: number;
      mobile: boolean;
    }) => Promise<void>;
  };
  HeadlessExperimental: {
    enable: () => Promise<void>;
    disable: () => Promise<void>;
    beginFrame: (params?: {
      frameTimeTicks?: number;
      interval?: number;
      noDisplayUpdates?: boolean;
      screenshot?: {
        format?: "jpeg" | "png" | "webp";
        quality?: number;
        optimizeForSpeed?: boolean;
      };
    }) => Promise<{ hasDamage: boolean; screenshotData?: string }>;
  };
  DOM: {
    enable: () => Promise<void>;
  };
};

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface SoundEvent {
  type: "click" | "key";
  timeMs: number;
}

export const TARGET_FPS = 60;
export const FRAME_MS = 1000 / TARGET_FPS;
export const DEFAULT_VIEWPORT_SIZE = 1080;
export const OFFSCREEN_MARGIN = 40;
export const CAPTURE_CYCLE_MS = 35;

export const DEFAULT_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.85 2.35a.5.5 0 0 0-.35.86z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export const DEFAULT_HUD_THEME = {
  background: "rgba(0,0,0,0.5)",
  color: "rgba(255,255,255,0.85)",
  fontSize: 56,
  fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
  borderRadius: 18,
  position: "bottom" as const,
};

export const DEFAULT_CURSOR_SIZE = 24;
