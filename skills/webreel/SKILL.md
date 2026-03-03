---
name: webreel
description: Create and record scripted browser demo videos with webreel. Generates MP4, GIF, or WebM recordings with cursor animation, keystroke overlays, and sound effects from a JSON config. Use when the user wants to record a demo, create a browser video, edit a webreel config, generate a screen recording, preview a demo, or work with webreel in any way.
---

# webreel

webreel records scripted browser demos as MP4, GIF, or WebM with cursor animation, keystroke overlays, and sound effects. You define steps in a JSON config, and webreel drives headless Chrome, captures frames, and encodes with ffmpeg.

## Installation

Install webreel as a project dependency so the version is pinned in the lockfile. This ensures deterministic recordings across machines and CI.

```bash
npm install webreel
```

If the project already has webreel in its dependencies, skip this step.

## Prerequisites

webreel requires Chrome and ffmpeg, but you do NOT need to install them manually. Both are automatically downloaded to `~/.webreel` on first run if not already present. Do not install Chrome or Chromium via puppeteer, playwright, or any other tool. webreel manages its own browser.

To download dependencies explicitly, or to fix corrupted/broken binaries:

```bash
npx webreel install
npx webreel install --force   # delete cached binaries and re-download
```

To override the auto-downloaded binaries, set these environment variables:

- `CHROME_PATH` - path to a Chrome or Chromium binary (used for preview)
- `CHROME_HEADLESS_PATH` - path to a chrome-headless-shell binary (used for recording)
- `FFMPEG_PATH` - path to an ffmpeg binary

If a recording fails with "No inspectable targets" or similar browser errors, the issue is almost certainly in the webreel config (wrong `waitFor`, missing element, timing), not a missing browser. Check the config and use `--verbose` to debug.

## .gitignore

The `.webreel` directory is created at the project root during recording (frames, intermediate files). Add it to `.gitignore`:

```
.webreel
```

## Quick start

```bash
# Scaffold a config
npx webreel init --name my-demo --url https://example.com

# Edit webreel.config.json with your steps

# Preview in a visible browser (no recording)
npx webreel preview my-demo

# Record the video
npx webreel record my-demo
```

`npx` resolves to the locally installed version when webreel is in `devDependencies`. Output lands in `videos/` by default (configurable via `outDir`).

## CLI commands

### init

Scaffold a new `webreel.config.json`.

```bash
webreel init
webreel init --name login-flow --url https://myapp.com
webreel init --name hero -o hero.config.json
```

Flags: `--name` (video name), `--url` (starting URL), `-o, --output` (output file path).

### record

Record one or more videos.

```bash
webreel record                        # all videos in config
webreel record hero login             # specific videos by name
webreel record -c custom.config.json  # custom config path
webreel record --watch                # re-record on config change
webreel record --verbose              # log each step
webreel record --dry-run              # print resolved config only
webreel record --frames               # save raw JPEGs to .webreel/frames/
```

### preview

Run steps in a visible browser without recording.

```bash
webreel preview
webreel preview hero --verbose
```

### composite

Re-apply overlays (cursor, HUD, sfx) to existing raw video without re-recording. Useful for tweaking theme settings.

```bash
webreel composite
webreel composite hero
```

### install

Download Chrome and ffmpeg to `~/.webreel`. Also use this to fix corrupted or broken binaries.

```bash
webreel install
webreel install --force  # delete cached binaries and re-download
```

### validate

Check config for errors without running anything.

```bash
webreel validate
webreel validate -c custom.config.json
```

## Config structure

Config files are auto-discovered as `webreel.config.json` (or `.ts`, `.mts`, `.js`, `.mjs`). Use `-c` to specify a custom path.

### Top-level fields

| Field          | Default     | Description                                      |
| -------------- | ----------- | ------------------------------------------------ |
| `$schema`      | -           | `"https://webreel.dev/schema/v1.json"`           |
| `outDir`       | `"videos/"` | Output directory for rendered videos             |
| `baseUrl`      | `""`        | Base URL prepended to relative video URLs        |
| `viewport`     | `1080x1080` | Default viewport `{ width, height }`             |
| `theme`        | -           | Cursor and HUD overlay theme                     |
| `sfx`          | -           | Sound effect settings                            |
| `include`      | -           | Array of step file paths prepended to all videos |
| `defaultDelay` | -           | Default delay (ms) appended after each step      |
| `clickDwell`   | -           | Cursor dwell time (ms) before a click            |

### Per-video fields

Each entry in the `videos` map supports:

| Field          | Default        | Description                                        |
| -------------- | -------------- | -------------------------------------------------- |
| `url`          | required       | URL to open (absolute or relative to `baseUrl`)    |
| `viewport`     | inherited      | Override viewport `{ width, height }`              |
| `zoom`         | -              | CSS zoom factor                                    |
| `waitFor`      | -              | Selector or text to wait for before starting steps |
| `output`       | `"<name>.mp4"` | Output path (`.mp4`, `.gif`, `.webm`)              |
| `thumbnail`    | `{ time: 0 }`  | Thumbnail config, or `{ enabled: false }`          |
| `include`      | inherited      | Step files to prepend                              |
| `theme`        | inherited      | Override theme                                     |
| `sfx`          | inherited      | Override sound effects                             |
| `defaultDelay` | inherited      | Override default delay                             |
| `clickDwell`   | inherited      | Override click dwell                               |
| `fps`          | `60`           | Frame rate                                         |
| `quality`      | `80`           | Encoding quality (1-100)                           |
| `steps`        | required       | Array of step objects                              |

### Videos map

Videos are keyed by name in the config:

```json
{
  "videos": {
    "hero": { "url": "...", "steps": [...] },
    "login": { "url": "...", "steps": [...] }
  }
}
```

Record specific videos by name: `webreel record hero login`.

## Step types

Each step has an `action` field. Most steps accept optional `label`, `delay` (ms after step), and `description` fields.

| Action       | Key fields                                  | Purpose                            |
| ------------ | ------------------------------------------- | ---------------------------------- |
| `pause`      | `ms`                                        | Wait for a duration                |
| `click`      | `text` or `selector`, `within`, `modifiers` | Click an element                   |
| `type`       | `text`, `selector`, `within`, `charDelay`   | Type text into an input            |
| `key`        | `key`, `target`                             | Press a key combo (e.g. `"cmd+s"`) |
| `drag`       | `from`, `to` (element targets)              | Drag between two elements          |
| `scroll`     | `x`, `y`, `selector`                        | Scroll the page or an element      |
| `wait`       | `selector` or `text`, `timeout`             | Wait for an element to appear      |
| `moveTo`     | `text` or `selector`, `within`              | Move cursor to an element          |
| `navigate`   | `url`                                       | Navigate to a new URL              |
| `hover`      | `text` or `selector`, `within`              | Hover over an element              |
| `select`     | `selector`, `value`                         | Select a dropdown value            |
| `screenshot` | `output`                                    | Capture a PNG screenshot           |

For full field details on every step type, see [steps-reference.md](steps-reference.md).

## Element targeting

Many steps target elements using these fields:

- `text` - match by visible text content
- `selector` - match by CSS selector
- `within` - narrow the search to a parent matching this CSS selector

You can use `text` or `selector` (not both). `within` is optional and scopes the search.

```json
{ "action": "click", "text": "Submit" }
{ "action": "click", "selector": "#submit-btn" }
{ "action": "click", "text": "Submit", "within": ".modal" }
```

## Viewport presets

Use preset names as string values for `viewport`, or specify `{ width, height }`:

`desktop` (1920x1080), `desktop-hd` (2560x1440), `laptop` (1366x768), `macbook-air` (1440x900), `macbook-pro` (1512x982), `ipad` (1024x1366), `ipad-pro` (834x1194), `ipad-mini` (768x1024), `iphone-15` (393x852), `iphone-15-pro-max` (430x932), `iphone-se` (375x667), `pixel-8` (412x915), `galaxy-s24` (360x780).

## Theme

Customize cursor appearance and keystroke HUD:

```json
{
  "theme": {
    "cursor": {
      "image": "./cursor.svg",
      "size": 32,
      "hotspot": "center"
    },
    "hud": {
      "background": "rgba(30, 41, 59, 0.85)",
      "color": "#e2e8f0",
      "fontSize": 48,
      "fontFamily": "\"SF Mono\", monospace",
      "borderRadius": 12,
      "position": "top"
    }
  }
}
```

- `cursor.image` - path to a custom cursor SVG or PNG
- `cursor.size` - cursor size in pixels
- `cursor.hotspot` - `"top-left"` (default) or `"center"`
- `hud.position` - `"top"` or `"bottom"`

## Common patterns

### Shared steps via include

Factor out reusable step sequences (e.g. dismissing a cookie banner) into JSON files:

```json
// steps/dismiss-banner.json
{
  "steps": [
    { "action": "wait", "selector": ".cookie-banner", "timeout": 5000 },
    { "action": "click", "selector": ".accept-btn", "delay": 300 }
  ]
}
```

Reference them in the config:

```json
{
  "include": ["./steps/dismiss-banner.json"],
  "videos": { ... }
}
```

### Multiple videos in one config

Define several videos in the `videos` map. Shared settings (`viewport`, `theme`, `defaultDelay`) are inherited from the top level.

### Environment variables

Config values support `$VAR` and `${VAR}` substitution from the environment.

### Output formats

Set the `output` extension to control format: `.mp4` (default), `.gif`, `.webm`.

```json
{ "output": "demo.gif" }
```

## Tips

- Always set `waitFor` on a video to ensure the page is ready before steps run.
- Use `delay` on individual steps to control pacing between actions.
- Use `--watch` during development for automatic re-recording on config changes.
- Use `composite` to iterate on theme/overlay settings without re-recording.
- Use `--verbose` to debug step execution.
- Use `--dry-run` to inspect the fully resolved config (includes, env vars, defaults).
- Use `zoom` to scale up small UIs for readability in the recording.
- Start with `preview` to verify steps work before committing to a full recording.

## Reference files

- [steps-reference.md](steps-reference.md) - detailed docs for all 12 step types
- [examples.md](examples.md) - annotated config examples for common use cases
