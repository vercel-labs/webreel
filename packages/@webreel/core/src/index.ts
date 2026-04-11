export type { CDPClient, BoundingBox, Point, SoundEvent } from "./types.js";
export {
  TARGET_FPS,
  FRAME_MS,
  DEFAULT_VIEWPORT_SIZE,
  OFFSCREEN_MARGIN,
  DEFAULT_CURSOR_SVG,
  DEFAULT_CURSOR_SIZE,
  DEFAULT_HUD_THEME,
} from "./types.js";
export { connectCDP } from "./cdp.js";
export {
  launchChrome,
  ensureChrome,
  ensureHeadlessShell,
  CHROME_CACHE_DIR,
  HEADLESS_SHELL_CACHE_DIR,
  type ChromeInstance,
  type LaunchChromeOptions,
} from "./chrome.js";
export { injectOverlays, showKeys, hideKeys, type OverlayTheme } from "./overlays.js";
export {
  RecordingContext,
  modKey,
  pause,
  navigate,
  waitForSelector,
  waitForText,
  findElementByText,
  findElementBySelector,
  moveCursorTo,
  clickAt,
  pressKey,
  typeText,
  dragFromTo,
  captureScreenshot,
} from "./actions.js";
export { Recorder, type FrameSink } from "./recorder.js";
export {
  InteractionTimeline,
  type TimelineData,
  type TimelineWindowConfig,
  type TimelineBackgroundConfig,
} from "./timeline.js";
export { compose, prepareStreamCompositor, type ComposeOptions } from "./compositor.js";
export { ensureFfmpeg, FFMPEG_CACHE_DIR } from "./ffmpeg.js";
export { extractThumbnail, type SfxConfig } from "./media.js";
export { moveFileSync } from "./fs.js";
