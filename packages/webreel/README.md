# webreel

CLI that records scripted browser videos as MP4, GIF, or WebM files from JSON configs.

Define steps (clicks, key presses, drags, pauses) and webreel drives a headless Chrome instance, captures screenshots at ~60fps, adds cursor animation, keystroke overlays, and sound effects, and encodes the result with ffmpeg.

## Installation

```bash
npm install webreel
```

## Quick Start

```bash
npx webreel init --name my-video --url https://example.com
npx webreel record
```

## Examples

<!-- EXAMPLES:START -->

**[custom-theme](../../examples/custom-theme)** - Demonstrates fully customizing the cursor overlay and keystroke HUD appearance using a code editor page.

<video src="../../examples/custom-theme/videos/custom-theme.mp4" controls muted width="100%"></video>

**[drag-and-drop](../../examples/drag-and-drop)** - Demonstrates dragging elements between positions on a kanban board.

<video src="../../examples/drag-and-drop/videos/drag-and-drop.mp4" controls muted width="100%"></video>

**[form-filling](../../examples/form-filling)** - Demonstrates typing into form fields and clicking a submit button, simulating a login flow.

<video src="../../examples/form-filling/videos/form-filling.mp4" controls muted width="100%"></video>

**[gif-output](../../examples/gif-output)** - Demonstrates outputting the recording as an animated GIF instead of the default MP4.

<video src="../../examples/gif-output/videos/gif-output.gif" controls muted width="100%"></video>

**[hello-world](../../examples/hello-world)** - The simplest possible webreel example. Opens a landing page and clicks the call-to-action button.

<video src="../../examples/hello-world/videos/hello-world.mp4" controls muted width="100%"></video>

**[keyboard-shortcuts](../../examples/keyboard-shortcuts)** - Demonstrates pressing key combos and displaying them in the keystroke HUD overlay. Uses a code editor page as the target.

<video src="../../examples/keyboard-shortcuts/videos/keyboard-shortcuts.mp4" controls muted width="100%"></video>

**[mobile-viewport](../../examples/mobile-viewport)** - Demonstrates recording at mobile device dimensions using a finance app interface.

<video src="../../examples/mobile-viewport/videos/mobile-viewport.mp4" controls muted width="100%"></video>

**[modifier-clicks](../../examples/modifier-clicks)** - Demonstrates clicking elements with modifier keys held down, simulating multi-select in a file manager.

<video src="../../examples/modifier-clicks/videos/modifier-clicks.mp4" controls muted width="100%"></video>

**[multi-demo](../../examples/multi-demo)** - Demonstrates defining multiple videos in a single config file, each producing its own output from the same page.

<video src="../../examples/multi-demo/videos/homepage.mp4" controls muted width="100%"></video>

**[page-scrolling](../../examples/page-scrolling)** - Demonstrates scrolling the page and scrolling within a specific container element on a blog post layout.

<video src="../../examples/page-scrolling/videos/page-scrolling.mp4" controls muted width="100%"></video>

**[screenshots](../../examples/screenshots)** - Demonstrates capturing PNG screenshots at specific points during a recording. Useful for generating static marketing assets or documentation images alongside videos.

<video src="../../examples/screenshots/videos/screenshots.mp4" controls muted width="100%"></video>

**[shared-steps](../../examples/shared-steps)** - Demonstrates using `include` to share common setup steps across videos. The shared steps dismiss a cookie consent banner before the main video steps run.

<video src="../../examples/shared-steps/shared-steps.mp4" controls muted width="100%"></video>

**[webm-output](../../examples/webm-output)** - Demonstrates outputting the recording as a WebM video using VP9 encoding.

<video src="../../examples/webm-output/webm-output.webm" controls muted width="100%"></video>

<!-- EXAMPLES:END -->

## Commands

### `webreel init`

Scaffold a new config file.

```bash
webreel init
webreel init --name login-flow --url https://myapp.com
webreel init --name hero -o hero.config.json
```

| Option                | Default               | Description      |
| --------------------- | --------------------- | ---------------- |
| `--name <name>`       | `my-video`            | Video name       |
| `--url <url>`         | `https://example.com` | Starting URL     |
| `-o, --output <file>` | `<name>.json`         | Output file path |

### `webreel record`

Record videos.

```bash
webreel record
webreel record hero login
webreel record -c custom.config.json
```

When run without arguments, webreel reads `webreel.config.json` from the current directory and records all videos. Provide video names to record specific videos only.

### `webreel preview`

Run a video in a visible browser window without recording.

```bash
webreel preview
webreel preview hero
```

### `webreel install`

Download Chrome and ffmpeg to `~/.webreel`. Both are also auto-downloaded on first run. Use `--force` to fix corrupted or broken binaries.

```bash
webreel install
webreel install --force
```

### `webreel validate`

Check config files for errors without running them.

```bash
webreel validate
webreel validate -c custom.config.json
```

### `webreel composite`

Re-composite videos from stored raw recordings and timelines without re-recording.

```bash
webreel composite
webreel composite hero login
```

Raw video and timeline data are saved in `.webreel/raw/` and `.webreel/timelines/` during `webreel record`. Use `composite` to re-apply cursor overlays, HUD, and sound effects without re-running the browser.

## Config format

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "videos": {
    "my-video": {
      "url": "https://example.com",
      "viewport": { "width": 1080, "height": 1080 },
      "defaultDelay": 500,
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "text": "Get Started" },
        { "action": "key", "key": "cmd+a", "delay": 1000 }
      ]
    }
  }
}
```

### Config options

| Field          | Default       | Description                                               |
| -------------- | ------------- | --------------------------------------------------------- |
| `url`          | required      | URL to navigate to                                        |
| `baseUrl`      | `""`          | Prepended to relative URLs                                |
| `viewport`     | 1080x1080     | Browser viewport dimensions                               |
| `zoom`         | -             | CSS zoom level applied to the page                        |
| `waitFor`      | -             | CSS selector to wait for before starting                  |
| `output`       | `<name>.mp4`  | Output file path (`.mp4`, `.gif`, or `.webm`)             |
| `thumbnail`    | `{ time: 0 }` | Object with `time` (seconds) or `enabled: false`          |
| `theme`        | -             | Overlay theme (`cursor: { image, size, hotspot }`, `hud`) |
| `include`      | -             | Array of JSON file paths whose steps are prepended        |
| `defaultDelay` | -             | Default delay (ms) after each step                        |

### Actions

| Action       | Fields                                                 | Description                           |
| ------------ | ------------------------------------------------------ | ------------------------------------- |
| `pause`      | `ms`                                                   | Wait for a duration                   |
| `click`      | `text` or `selector`, optional `within`, `modifiers`   | Move cursor to an element and click   |
| `key`        | `key` (e.g. `"cmd+z"`), optional `label`, `target`     | Press a key or key combo              |
| `type`       | `text`, optional `target`, `charDelay`                 | Type text character by character      |
| `drag`       | `from` and `to` (each with `text`/`selector`/`within`) | Drag from one element to another      |
| `scroll`     | optional `x`, `y`, `selector`                          | Scroll the page or a container        |
| `wait`       | `selector` or `text`, optional `timeout`               | Wait for an element or text to appear |
| `moveTo`     | `text` or `selector`, optional `within`                | Move cursor to an element             |
| `screenshot` | `output`                                               | Save a PNG screenshot                 |
| `navigate`   | `url`                                                  | Navigate to a new URL mid-video       |
| `hover`      | `text` or `selector`, optional `within`                | Hover over an element (triggers CSS)  |
| `select`     | `selector`, `value`                                    | Select a value in a dropdown          |

All steps (except `pause`) accept an optional `delay` field (ms to wait after the step). Use `defaultDelay` at the top-level or per-video to set a default.

## License

Apache-2.0
