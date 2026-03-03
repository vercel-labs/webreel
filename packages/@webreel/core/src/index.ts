export type { CDPClient, BoundingBox, Point, SoundEvent } from "./types.js";
export {
  TARGET_FPS,
  FRAME_MS,
  DEFAULT_VIEWPORT_SIZE,
  OFFSCREEN_MARGIN,
  CAPTURE_CYCLE_MS,
  DEFAULT_CURSOR_SVG,
  DEFAULT_CURSOR_SIZE,
  DEFAULT_HUD_THEME,
} from "./types.js";
export { connectCDP } from "./cdp.js";
export {
  launchChrome,
  ensureChrome,
  ensureHeadlessShell,
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
export { Recorder } from "./recorder.js";
export { InteractionTimeline, type TimelineData } from "./timeline.js";
export { compose, type ComposeOptions } from "./compositor.js";
export { ensureFfmpeg } from "./ffmpeg.js";
export { extractThumbnail, type SfxConfig } from "./media.js";
