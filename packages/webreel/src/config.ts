export type {
  WebreelConfig,
  VideoConfig,
  Step,
  StepPause,
  StepClick,
  StepKey,
  StepDrag,
  StepType,
  StepScroll,
  StepWait,
  StepMoveTo,
  StepScreenshot,
  StepNavigate,
  StepHover,
  StepSelect,
  ThemeConfig,
  CursorConfig,
  ElementTarget,
} from "./lib/types.js";

export { VIEWPORT_PRESETS } from "./lib/types.js";

export type InputVideoConfig = Omit<import("./lib/types.js").VideoConfig, "name">;

export interface InputWebreelConfig {
  $schema?: string;
  outDir?: string;
  baseUrl?: string;
  viewport?: string | { width: number; height: number };
  theme?: import("./lib/types.js").ThemeConfig;
  sfx?: import("./lib/types.js").SfxConfig;
  include?: string[];
  defaultDelay?: number;
  clickDwell?: number;
  videos: Record<string, InputVideoConfig>;
}

export function defineConfig(config: InputWebreelConfig): InputWebreelConfig {
  return config;
}
