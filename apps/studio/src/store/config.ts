"use client";

import { atom } from "jotai";

interface ElementTarget {
  text?: string;
  selector?: string;
  within?: string;
}

interface ThemeCursorConfig {
  image?: string;
  size?: number;
  hotspot?: "top-left" | "center";
}

interface ThemeHudConfig {
  background?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  borderRadius?: number;
  position?: "top" | "bottom";
}

interface ThemeConfig {
  cursor?: ThemeCursorConfig;
  hud?: ThemeHudConfig;
}

interface SfxConfig {
  click?: 1 | 2 | 3 | 4 | string;
  key?: 1 | 2 | 3 | 4 | string;
}

interface WindowConfig {
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

interface BackgroundConfig {
  type: "solid" | "gradient" | "image";
  color?: string;
  gradient?: { from: string; to: string; angle?: number };
  image?: string;
}

interface ThumbnailConfig {
  enabled?: boolean;
  time?: number;
}

interface Step {
  action: string;
  [key: string]: unknown;
}

interface VideoConfig {
  url: string;
  baseUrl?: string;
  viewport?: { width: number; height: number } | string;
  screen?: { width: number; height: number };
  window?: WindowConfig;
  background?: BackgroundConfig;
  zoom?: number;
  fps?: number;
  quality?: number;
  waitFor?: string | ElementTarget;
  output?: string;
  include?: string[];
  defaultDelay?: number;
  clickDwell?: number;
  theme?: ThemeConfig;
  sfx?: SfxConfig;
  colorScheme?: "light" | "dark";
  thumbnail?: ThumbnailConfig;
  steps: Step[];
}

interface ParsedConfig {
  $schema?: string;
  outDir?: string;
  baseUrl?: string;
  viewport?: { width: number; height: number } | string;
  screen?: { width: number; height: number };
  window?: WindowConfig;
  background?: BackgroundConfig;
  defaultDelay?: number;
  clickDwell?: number;
  theme?: ThemeConfig;
  sfx?: SfxConfig;
  include?: string[];
  videos: Record<string, VideoConfig>;
}

const DEFAULT_CONFIG = JSON.stringify(
  {
    $schema: "https://webreel.dev/schema/v1.json",
    videos: {
      demo: {
        url: "https://vercel.com",
        viewport: { width: 1920, height: 1080 },
        zoom: 2,
        steps: [
          { action: "pause", ms: 500 },
          {
            action: "click",
            selector:
              "section.grid-module__4pDFEa__grid.grid-module__4pDFEa__useContainer:nth-child(2) > div.grid-module__4pDFEa__block.hero-module__pXb8lW__desktop:nth-child(3) > div.flex.flex-col > div.flex.flex-row:nth-child(2) > a.button-module__QyrFCa__base.reset-module__ylizOa__reset:nth-child(1)",
            delay: 1000,
          },
          { action: "pause", ms: 500 },
          {
            action: "click",
            selector:
              "button.button-module__QyrFCa__base.reset-module__ylizOa__reset.button-module__QyrFCa__button.button-module__QyrFCa__secondary.button-module__QyrFCa__small.button-module__QyrFCa__invert",
          },
          { action: "pause", ms: 500 },
        ],
      },
    },
  },
  null,
  2,
);

// ─── Core config atoms ──────────────────────────────────────────────────────

export const configJsonAtom = atom(DEFAULT_CONFIG);

export const parsedConfigAtom = atom<{
  config: ParsedConfig | null;
  error: string | null;
}>((get) => {
  const json = get(configJsonAtom);
  try {
    const parsed = JSON.parse(json) as ParsedConfig;
    return { config: parsed, error: null };
  } catch (e) {
    return {
      config: null,
      error: e instanceof Error ? e.message : "Invalid JSON",
    };
  }
});

export const selectedVideoAtom = atom<string | null>("demo");
export const selectedStepIndexAtom = atom<number>(-1);

export const selectedVideoConfigAtom = atom<VideoConfig | null>((get) => {
  const { config } = get(parsedConfigAtom);
  const videoName = get(selectedVideoAtom);
  if (!config || !videoName || !config.videos[videoName]) return null;
  return config.videos[videoName];
});

export const videoNamesAtom = atom<string[]>((get) => {
  const { config } = get(parsedConfigAtom);
  if (!config?.videos) return [];
  return Object.keys(config.videos);
});

// ─── Pick mode ──────────────────────────────────────────────────────────────

export const pickModeAtom = atom(false);
export const pickedSelectorAtom = atom<string | null>(null);

// ─── Render ─────────────────────────────────────────────────────────────────

export type RenderStatus = "idle" | "running" | "done" | "error";
export const renderStatusAtom = atom<RenderStatus>("idle");
export const renderLogsAtom = atom<string[]>([]);
export const lastRenderOutputAtom = atom<string | null>(null);

// ─── File management ────────────────────────────────────────────────────────

export const fileHandleAtom = atom<FileSystemFileHandle | null>(null);
export const fileNameAtom = atom<string | null>(null);
export const savedConfigJsonAtom = atom<string>(DEFAULT_CONFIG);
export const isDirtyAtom = atom(
  (get) => get(configJsonAtom) !== get(savedConfigJsonAtom),
);

// ─── Undo / redo ────────────────────────────────────────────────────────────

const MAX_HISTORY = 100;
const undoStackAtom = atom<string[]>([]);
const redoStackAtom = atom<string[]>([]);

export const canUndoAtom = atom((get) => get(undoStackAtom).length > 0);
export const canRedoAtom = atom((get) => get(redoStackAtom).length > 0);

export const commitConfigAtom = atom(null, (get, set, newJson: string) => {
  const current = get(configJsonAtom);
  if (current === newJson) return;
  const stack = get(undoStackAtom);
  set(undoStackAtom, [...stack.slice(-(MAX_HISTORY - 1)), current]);
  set(redoStackAtom, []);
  set(configJsonAtom, newJson);
});

export const undoAtom = atom(null, (get, set) => {
  const stack = get(undoStackAtom);
  if (stack.length === 0) return;
  const current = get(configJsonAtom);
  const previous = stack[stack.length - 1];
  set(undoStackAtom, stack.slice(0, -1));
  set(redoStackAtom, [...get(redoStackAtom), current]);
  set(configJsonAtom, previous);
});

export const redoAtom = atom(null, (get, set) => {
  const stack = get(redoStackAtom);
  if (stack.length === 0) return;
  const current = get(configJsonAtom);
  const next = stack[stack.length - 1];
  set(redoStackAtom, stack.slice(0, -1));
  set(undoStackAtom, [...get(undoStackAtom), current]);
  set(configJsonAtom, next);
});

// ─── Clipboard & multi-select ───────────────────────────────────────────────

export const clipboardStepsAtom = atom<Step[]>([]);
export const selectedStepIndicesAtom = atom<Set<number>>(new Set<number>());

// ─── Watch mode ─────────────────────────────────────────────────────────────

export const watchModeAtom = atom(false);

// ─── Env var overrides for preview / recording ──────────────────────────────

export const envVarsAtom = atom<Record<string, string>>({});

// ─── Simulation state ────────────────────────────────────────────────────────

export type PreviewMode = "full" | "step";
export const previewModeAtom = atom<PreviewMode>("full");

export type SimulationStatus = "idle" | "playing" | "paused";
export const simulationStatusAtom = atom<SimulationStatus>("idle");
export const simulationSpeedAtom = atom<number>(1);
export const simulationStepAtom = atom<number>(-1);
export const highlightFoundAtom = atom<boolean | null>(null);

// ─── Replay state (fast-forward to step N) ──────────────────────────────────

export interface ReplayState {
  status: "idle" | "replaying";
  targetStep: number;
  currentStep: number;
}

export const replayStateAtom = atom<ReplayState>({
  status: "idle",
  targetStep: -1,
  currentStep: -1,
});

export const replayedThroughStepAtom = atom<number>(-1);

// ─── Viewport presets ───────────────────────────────────────────────────────

export const VIEWPORT_PRESETS: Record<
  string,
  { width: number; height: number; label: string }
> = {
  desktop: { width: 1920, height: 1080, label: "Desktop (1920x1080)" },
  "desktop-hd": { width: 2560, height: 1440, label: "Desktop HD (2560x1440)" },
  laptop: { width: 1366, height: 768, label: "Laptop (1366x768)" },
  "macbook-air": { width: 1440, height: 900, label: "MacBook Air (1440x900)" },
  "macbook-pro": { width: 1512, height: 982, label: "MacBook Pro (1512x982)" },
  ipad: { width: 1024, height: 1366, label: "iPad (1024x1366)" },
  "ipad-pro": { width: 1366, height: 1024, label: 'iPad Pro 12.9" (1366x1024)' },
  "ipad-mini": { width: 768, height: 1024, label: "iPad Mini (768x1024)" },
  "iphone-15": { width: 393, height: 852, label: "iPhone 15 (393x852)" },
  "iphone-15-pro-max": { width: 430, height: 932, label: "iPhone 15 Pro Max (430x932)" },
  "iphone-se": { width: 375, height: 667, label: "iPhone SE (375x667)" },
  "pixel-8": { width: 412, height: 915, label: "Pixel 8 (412x915)" },
  "galaxy-s24": { width: 360, height: 780, label: "Galaxy S24 (360x780)" },
};

// ─── Step templates ─────────────────────────────────────────────────────────

export interface StepTemplate {
  label: string;
  description: string;
  step: Step;
}

export const STEP_TEMPLATES: StepTemplate[] = [
  {
    label: "Click element",
    description: "Click a CSS selector or text",
    step: { action: "click", selector: "" },
  },
  {
    label: "Type into input",
    description: "Type text with realistic delay",
    step: { action: "type", text: "", selector: "" },
  },
  {
    label: "Navigate to page",
    description: "Go to a new URL",
    step: { action: "navigate", url: "" },
  },
  {
    label: "Wait for element",
    description: "Wait for selector to appear",
    step: { action: "wait", selector: "", timeout: 30000 },
  },
  {
    label: "Take screenshot",
    description: "Capture a PNG screenshot",
    step: { action: "screenshot", output: "screenshot.png" },
  },
  {
    label: "Scroll down",
    description: "Scroll the page vertically",
    step: { action: "scroll", y: 500 },
  },
  {
    label: "Pause",
    description: "Wait for a fixed duration",
    step: { action: "pause", ms: 500 },
  },
  {
    label: "Press key",
    description: "Press a keyboard key",
    step: { action: "key", key: "Enter" },
  },
  {
    label: "Hover element",
    description: "Hover over an element",
    step: { action: "hover", selector: "" },
  },
  {
    label: "Select option",
    description: "Select a dropdown value",
    step: { action: "select", selector: "", value: "" },
  },
  {
    label: "Move cursor",
    description: "Move cursor to an element",
    step: { action: "moveTo", selector: "" },
  },
  {
    label: "Drag element",
    description: "Drag from one element to another",
    step: { action: "drag", from: { selector: "" }, to: { selector: "" } },
  },
];

export { DEFAULT_CONFIG };
export type {
  Step,
  VideoConfig,
  ParsedConfig,
  ElementTarget,
  ThemeConfig,
  ThemeCursorConfig,
  ThemeHudConfig,
  SfxConfig,
  ThumbnailConfig,
  WindowConfig,
  BackgroundConfig,
};
