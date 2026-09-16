export type {
  WebreelConfig,
  VideoConfig,
  FullConfig,
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

export {
  loadWebreelConfig,
  loadFullConfig,
  resolveConfigPath,
  resolveConfigPaths,
  filterVideosByName,
} from "./lib/config.js";

export type InputVideoConfig = Omit<
  import("./lib/types.js").VideoConfig,
  "name" | "configDir"
>;

export interface InputScenarioConfig {
  extends?: boolean | string;
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

export interface InputWebreelConfig {
  $schema?: string;
  extends?: string;
  outDir?: string;
  baseUrl?: string;
  viewport?: string | { width: number; height: number };
  theme?: import("./lib/types.js").ThemeConfig;
  sfx?: import("./lib/types.js").SfxConfig;
  include?: string[];
  defaultDelay?: number;
  clickDwell?: number;
  scenarios?: (string | InputScenarioConfig)[];
  videos?: Record<string, InputVideoConfig>;
}

export function defineConfig(config: InputWebreelConfig): InputWebreelConfig {
  return config;
}

export function defineScenario(config: InputScenarioConfig): InputScenarioConfig {
  return config;
}
