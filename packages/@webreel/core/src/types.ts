export type CDPClient = {
  close: () => Promise<void>;
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
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
  DOM: {
    enable: () => Promise<void>;
  };
  HeadlessExperimental?: {
    enable: () => Promise<void>;
    disable: () => Promise<void>;
    beginFrame: (params?: {
      frameTimeTicks?: number;
      interval?: number;
      noDisplayUpdates?: boolean;
      screenshot?: {
        format?: string;
        quality?: number;
      };
    }) => Promise<{
      hasDamage: boolean;
      screenshotData?: string;
    }>;
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
  background: "transparent",
  color: "rgba(255, 255, 255, 0.9)",
  fontSize: 48,
  fontFamily: '"Geist", "SF Pro", -apple-system, BlinkMacSystemFont, sans-serif',
  borderRadius: 16,
  position: "bottom" as const,
  blur: 20,
  border: "transparent",
  shadow: "none",
  keyBackground: "rgba(22, 22, 22, 0.65)",
  keyBorder: "rgba(255, 255, 255, 0.12)",
  keyBorderRadius: 12,
  keyPadding: "10px 20px",
};

export const DEFAULT_CURSOR_SIZE = 24;

export interface ModifierIcon {
  paths: string[];
}

export const MODIFIER_ICONS: Record<string, ModifierIcon> = {
  "\u2318": {
    paths: ["M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"],
  },
  "\u21E7": {
    paths: ["m18 15-6-6-6 6"],
  },
  "\u2325": {
    paths: ["M3 3h6l6 18h6", "M14 3h7"],
  },
  "\u2191": {
    paths: ["m5 12 7-7 7 7", "M12 19V5"],
  },
  "\u2193": {
    paths: ["M12 5v14", "m19 12-7 7-7-7"],
  },
  "\u2190": {
    paths: ["m12 19-7-7 7-7", "M19 12H5"],
  },
  "\u2192": {
    paths: ["M5 12h14", "m12 5 7 7-7 7"],
  },
};
