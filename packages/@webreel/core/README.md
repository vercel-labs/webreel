# @webreel/core

Chrome automation, recording, and overlay engine for webreel.

Launches a headless Chrome instance via the Chrome DevTools Protocol, captures screenshots at ~60fps, and encodes the result to MP4 with ffmpeg. Provides actions for clicking, typing, dragging, and cursor animation, plus on-screen overlays for keystroke labels and a custom cursor.

## Installation

```bash
npm install @webreel/core
```

## Examples

<!-- EXAMPLES:START -->

**[custom-theme](../../../examples/custom-theme)** - Demonstrates fully customizing the cursor overlay and keystroke HUD appearance using a code editor page.

<video src="../../../examples/custom-theme/videos/custom-theme.mp4" controls muted width="100%"></video>

**[drag-and-drop](../../../examples/drag-and-drop)** - Demonstrates dragging elements between positions on a kanban board.

<video src="../../../examples/drag-and-drop/videos/drag-and-drop.mp4" controls muted width="100%"></video>

**[form-filling](../../../examples/form-filling)** - Demonstrates typing into form fields and clicking a submit button, simulating a login flow.

<video src="../../../examples/form-filling/videos/form-filling.mp4" controls muted width="100%"></video>

**[gif-output](../../../examples/gif-output)** - Demonstrates outputting the recording as an animated GIF instead of the default MP4.

<video src="../../../examples/gif-output/videos/gif-output.gif" controls muted width="100%"></video>

**[hello-world](../../../examples/hello-world)** - The simplest possible webreel example. Opens a landing page and clicks the call-to-action button.

<video src="../../../examples/hello-world/videos/hello-world.mp4" controls muted width="100%"></video>

**[keyboard-shortcuts](../../../examples/keyboard-shortcuts)** - Demonstrates pressing key combos and displaying them in the keystroke HUD overlay. Uses a code editor page as the target.

<video src="../../../examples/keyboard-shortcuts/videos/keyboard-shortcuts.mp4" controls muted width="100%"></video>

**[mobile-viewport](../../../examples/mobile-viewport)** - Demonstrates recording at mobile device dimensions using a finance app interface.

<video src="../../../examples/mobile-viewport/videos/mobile-viewport.mp4" controls muted width="100%"></video>

**[modifier-clicks](../../../examples/modifier-clicks)** - Demonstrates clicking elements with modifier keys held down, simulating multi-select in a file manager.

<video src="../../../examples/modifier-clicks/videos/modifier-clicks.mp4" controls muted width="100%"></video>

**[multi-demo](../../../examples/multi-demo)** - Demonstrates defining multiple videos in a single config file, each producing its own output from the same page.

<video src="../../../examples/multi-demo/videos/homepage.mp4" controls muted width="100%"></video>

**[page-scrolling](../../../examples/page-scrolling)** - Demonstrates scrolling the page and scrolling within a specific container element on a blog post layout.

<video src="../../../examples/page-scrolling/videos/page-scrolling.mp4" controls muted width="100%"></video>

**[screenshots](../../../examples/screenshots)** - Demonstrates capturing PNG screenshots at specific points during a recording. Useful for generating static marketing assets or documentation images alongside videos.

<video src="../../../examples/screenshots/videos/screenshots.mp4" controls muted width="100%"></video>

**[shared-steps](../../../examples/shared-steps)** - Demonstrates using `include` to share common setup steps across videos. The shared steps dismiss a cookie consent banner before the main video steps run.

<video src="../../../examples/shared-steps/shared-steps.mp4" controls muted width="100%"></video>

**[webm-output](../../../examples/webm-output)** - Demonstrates outputting the recording as a WebM video using VP9 encoding.

<video src="../../../examples/webm-output/webm-output.webm" controls muted width="100%"></video>

<!-- EXAMPLES:END -->

## Usage

```ts
import {
  RecordingContext,
  launchChrome,
  connectCDP,
  navigate,
  clickAt,
  pressKey,
  pause,
  Recorder,
  InteractionTimeline,
  compose,
} from "@webreel/core";

const ctx = new RecordingContext();
ctx.setMode("record");

const chrome = await launchChrome({ headless: true });
const client = await connectCDP(chrome.port);

await client.Page.enable();
await client.Runtime.enable();
await client.Emulation.setDeviceMetricsOverride({
  width: 1080,
  height: 1080,
  deviceScaleFactor: 2,
  mobile: false,
});

const timeline = new InteractionTimeline(1080, 1080, { zoom: 2 });
ctx.setTimeline(timeline);

await navigate(client, "https://example.com");

const recorder = new Recorder(1080, 1080);
recorder.setTimeline(timeline);
await recorder.start(client, "demo.mp4", ctx);

await pause(500);
await clickAt(ctx, client, 540, 400);
await pressKey(ctx, client, "cmd+a");
await pause(1000);

await recorder.stop();

await compose(recorder.getTempVideoPath(), timeline.toJSON(), "demo.mp4");

await client.close();
chrome.kill();
```

## API

### Chrome

#### `launchChrome(options?): Promise<ChromeInstance>`

Launches a Chrome process with remote debugging enabled.

| Option     | Type      | Default | Description          |
| ---------- | --------- | ------- | -------------------- |
| `headless` | `boolean` | `true`  | Run in headless mode |

Returns a `ChromeInstance` with `process`, `port`, and `kill()`.

### Recorder

#### `new Recorder(width?, height?, assetsDir?)`

Creates a recorder that captures screenshots and encodes them to MP4.

#### `recorder.start(client, outputPath, ctx?): Promise<void>`

Begin capturing frames. Pass an optional `RecordingContext` to track cursor position and timeline events.

#### `recorder.stop(): Promise<void>`

Stop capturing, encode to MP4 with sound effects, and clean up temp files.

### Actions

All action functions that animate the cursor take a `RecordingContext` as their first argument.

| Function                                           | Description                                       |
| -------------------------------------------------- | ------------------------------------------------- |
| `navigate(client, url)`                            | Navigate to a URL and wait for load               |
| `waitForSelector(client, selector, timeout?)`      | Poll until a CSS selector matches                 |
| `findElementByText(client, text, within?)`         | Find an element's bounding box by text content    |
| `findElementBySelector(client, selector, within?)` | Find an element's bounding box by CSS selector    |
| `moveCursorTo(ctx, client, x, y)`                  | Animate the overlay cursor to a position          |
| `clickAt(ctx, client, x, y, modifiers?)`           | Move cursor and click with optional modifier keys |
| `pressKey(ctx, client, key, label?)`               | Press a key combo (e.g. `"cmd+z"`) with overlay   |
| `typeText(ctx, client, text, delayMs?)`            | Type text character by character                  |
| `dragFromTo(ctx, client, fromBox, toBox)`          | Drag between two elements                         |
| `captureScreenshot(client, outputPath)`            | Save a PNG screenshot                             |
| `pause(ms?)`                                       | Wait for a duration (default 1200ms)              |
| `modKey()`                                         | Returns `"cmd"` on macOS, `"ctrl"` elsewhere      |

### Overlays

| Function                                           | Description                                           |
| -------------------------------------------------- | ----------------------------------------------------- |
| `injectOverlays(client, theme?, initialPosition?)` | Add cursor and keystroke overlay elements to the page |
| `showKeys(client, labels)`                         | Display keystroke labels on screen                    |
| `hideKeys(client)`                                 | Hide the keystroke overlay                            |

## Prerequisites

- [Google Chrome](https://www.google.com/chrome/) (or Chromium)
- [ffmpeg](https://ffmpeg.org/)

Set `CHROME_PATH` to override the default Chrome location.

## License

Apache-2.0
