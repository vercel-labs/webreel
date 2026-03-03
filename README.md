# webreel

Record scripted browser videos as MP4 files with sound effects, cursor animation, and keystroke overlays.

[Documentation](https://webreel.dev) | [Examples](https://webreel.dev/examples)

Define steps in a JSON config (clicks, key presses, drags, pauses) and webreel drives a headless Chrome instance, captures screenshots at ~60fps, and encodes the result with ffmpeg.

Chrome and ffmpeg are downloaded automatically on first use to `~/.webreel` if not already installed.

## Quick Start

```bash
npm install webreel
npx webreel init --name my-video --url https://example.com
npx webreel record
```

## Examples

<!-- EXAMPLES:START -->

**[custom-theme](examples/custom-theme)** - Demonstrates fully customizing the cursor overlay and keystroke HUD appearance using a code editor page.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/custom-theme/videos/custom-theme.mp4" controls muted width="100%"></video>

**[drag-and-drop](examples/drag-and-drop)** - Demonstrates dragging elements between positions on a kanban board.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/drag-and-drop/videos/drag-and-drop.mp4" controls muted width="100%"></video>

**[form-filling](examples/form-filling)** - Demonstrates typing into form fields and clicking a submit button, simulating a login flow.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/form-filling/videos/form-filling.mp4" controls muted width="100%"></video>

**[gif-output](examples/gif-output)** - Demonstrates outputting the recording as an animated GIF instead of the default MP4.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/gif-output/videos/gif-output.gif" controls muted width="100%"></video>

**[hello-world](examples/hello-world)** - The simplest possible webreel example. Opens a landing page and clicks the call-to-action button.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/hello-world/videos/hello-world.mp4" controls muted width="100%"></video>

**[keyboard-shortcuts](examples/keyboard-shortcuts)** - Demonstrates pressing key combos and displaying them in the keystroke HUD overlay. Uses a code editor page as the target.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/keyboard-shortcuts/videos/keyboard-shortcuts.mp4" controls muted width="100%"></video>

**[mobile-viewport](examples/mobile-viewport)** - Demonstrates recording at mobile device dimensions using a finance app interface.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/mobile-viewport/videos/mobile-viewport.mp4" controls muted width="100%"></video>

**[modifier-clicks](examples/modifier-clicks)** - Demonstrates clicking elements with modifier keys held down, simulating multi-select in a file manager.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/modifier-clicks/videos/modifier-clicks.mp4" controls muted width="100%"></video>

**[multi-demo](examples/multi-demo)** - Demonstrates defining multiple videos in a single config file, each producing its own output from the same page.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/multi-demo/videos/homepage.mp4" controls muted width="100%"></video>

**[page-scrolling](examples/page-scrolling)** - Demonstrates scrolling the page and scrolling within a specific container element on a blog post layout.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/page-scrolling/videos/page-scrolling.mp4" controls muted width="100%"></video>

**[screenshots](examples/screenshots)** - Demonstrates capturing PNG screenshots at specific points during a recording. Useful for generating static marketing assets or documentation images alongside videos.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/screenshots/videos/screenshots.mp4" controls muted width="100%"></video>

**[shared-steps](examples/shared-steps)** - Demonstrates using `include` to share common setup steps across videos. The shared steps dismiss a cookie consent banner before the main video steps run.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/shared-steps/shared-steps.mp4" controls muted width="100%"></video>

**[webm-output](examples/webm-output)** - Demonstrates outputting the recording as a WebM video using VP9 encoding.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/webm-output/webm-output.webm" controls muted width="100%"></video>

<!-- EXAMPLES:END -->

## Usage

### Init

Scaffold a new config file:

```bash
webreel init
webreel init --name login-flow --url https://myapp.com
webreel init --name hero -o hero.config.json
```

This creates a `webreel.config.json` with a `$schema` for IDE autocompletion:

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

### Record

Record videos:

```bash
webreel record
webreel record hero login
webreel record -c custom.config.json
webreel record --watch
webreel record --verbose
```

### Preview

Run a video in a visible browser window without recording:

```bash
webreel preview
webreel preview hero
webreel preview hero --verbose
```

### Composite

Re-composite videos from stored raw recordings and timelines without re-recording:

```bash
webreel composite
webreel composite hero
```

### Install

Download Chrome and ffmpeg to `~/.webreel`. Both are also auto-downloaded on first run. Use `--force` to fix corrupted or broken binaries.

```bash
webreel install
webreel install --force
```

### Validate

Check config files for errors without running them:

```bash
webreel validate
webreel validate -c custom.config.json
```

### Help and Version

```bash
webreel --help
webreel --version
webreel record --help
```

### Actions

| Action       | Fields                                                 | Description                          |
| ------------ | ------------------------------------------------------ | ------------------------------------ |
| `pause`      | `ms`                                                   | Wait for a duration                  |
| `click`      | `text` or `selector`, optional `within`, `modifiers`   | Move cursor to an element and click  |
| `key`        | `key` (e.g. `"cmd+z"`), optional `label`               | Press a key or key combo             |
| `type`       | `text`, optional `target`, `charDelay`                 | Type text character by character     |
| `scroll`     | optional `x`, `y`, `selector`                          | Scroll the page or an element        |
| `wait`       | `selector` or `text`, optional `timeout`               | Wait for an element to appear        |
| `screenshot` | `output`                                               | Capture a PNG screenshot             |
| `drag`       | `from` and `to` (each with `text`/`selector`/`within`) | Drag from one element to another     |
| `moveTo`     | `text` or `selector`, optional `within`                | Move cursor to an element            |
| `navigate`   | `url`                                                  | Navigate to a new URL mid-video      |
| `hover`      | `text` or `selector`, optional `within`                | Hover over an element (triggers CSS) |
| `select`     | `selector`, `value`                                    | Select a value in a dropdown         |

All steps (except `pause`) accept an optional `delay` field (ms to wait after the step). Use `defaultDelay` at the top-level or per-video to set a default.

### Config options

#### Top-level

| Field          | Default   | Description                                  |
| -------------- | --------- | -------------------------------------------- |
| `$schema`      | -         | JSON Schema URL for IDE autocompletion       |
| `outDir`       | `videos/` | Default output directory for videos          |
| `baseUrl`      | `""`      | Prepended to relative video URLs             |
| `viewport`     | 1080x1080 | Default browser viewport dimensions          |
| `theme`        | -         | Default cursor and HUD overlay customization |
| `include`      | -         | Array of step files prepended to all videos  |
| `defaultDelay` | -         | Default delay (ms) after each step           |
| `videos`       | required  | Object mapping video names to their configs  |

#### Per-video

| Field          | Default       | Description                                            |
| -------------- | ------------- | ------------------------------------------------------ |
| `url`          | required      | URL to navigate to                                     |
| `baseUrl`      | inherited     | Prepended to relative URLs                             |
| `viewport`     | inherited     | Browser viewport dimensions                            |
| `zoom`         | -             | CSS zoom level applied to the page                     |
| `waitFor`      | -             | CSS selector to wait for before start                  |
| `output`       | `<name>.mp4`  | Output file path (.mp4, .gif, or .webm)                |
| `thumbnail`    | `{ time: 0 }` | Object with `time` (seconds) or `enabled: false`       |
| `include`      | inherited     | Array of paths to JSON files whose steps are prepended |
| `theme`        | inherited     | Cursor and HUD overlay customization                   |
| `defaultDelay` | inherited     | Default delay (ms) after each step                     |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)

### Setup

```bash
pnpm install
pnpm build
```

## Packages

| Package                                   | Description                                |
| ----------------------------------------- | ------------------------------------------ |
| [`@webreel/core`](packages/@webreel/core) | Chrome automation, recording, and overlays |
| [`webreel`](packages/webreel)             | CLI that records videos from JSON configs  |

## License

Apache-2.0
