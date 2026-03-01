---
name: webreel
description: Best practices and architecture reference for the webreel monorepo. Use when working with webreel source code, adding features, fixing bugs, or extending the CLI or core library. Covers project structure, the @webreel/core API, the webreel CLI, and the JSON config format.
---

# webreel

Record scripted browser videos as MP4/GIF/WebM files with sound effects, cursor animation, and keystroke overlays. Steps are defined in JSON configs and executed via Chrome DevTools Protocol.

## Project structure

pnpm monorepo with two packages:

```
packages/
  @webreel/core/     # Chrome automation, recording, and overlays
  webreel/           # CLI that records videos from JSON configs
```

`webreel` depends on `@webreel/core` via `workspace:*`.

Both packages are ESM (`"type": "module"`) and compiled with `tsc`. Import paths use `.js` extensions.

## @webreel/core

Exports from `src/index.ts`:

| Module        | Exports                                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chrome.ts`   | `launchChrome(options?)`: spawns Chrome with remote debugging, auto-downloads Chrome for Testing if needed, returns `{ process, port, kill() }`                                                                                               |
| `recorder.ts` | `Recorder` class: captures screenshots at ~60fps, encodes to MP4/GIF/WebM with ffmpeg, mixes in click/key sound effects                                                                                                                       |
| `actions.ts`  | `navigate`, `waitForSelector`, `findElementByText`, `findElementBySelector`, `moveCursorTo`, `resetCursorPosition`, `clickAt`, `pressKey`, `typeText`, `dragFromTo`, `captureScreenshot`, `pause`, `modKey`, `markEvent`, `setActiveRecorder` |
| `overlays.ts` | `injectOverlays(client, theme?)` (cursor + keystroke HUD), `showKeys`, `hideKeys`, `OverlayTheme`                                                                                                                                             |
| `types.ts`    | `CDPClient`, `BoundingBox`                                                                                                                                                                                                                    |
| `ffmpeg.ts`   | `ensureFfmpeg()`: resolves ffmpeg path, auto-downloads from ffbinaries.com if needed                                                                                                                                                          |
| `download.ts` | `fetchJson`, `downloadAndExtract`, `makeExecutable`: shared download utilities                                                                                                                                                                |

### Key patterns

- All actions take a `CDPClient` as the first argument. This is a typed subset of the CDP API covering `Runtime`, `Page`, `Input`, and `Emulation` domains.
- DOM queries are executed via `Runtime.evaluate` with inline JS expressions that return serializable values.
- `findElementByText` walks all visible text nodes via TreeWalker, returning the smallest element containing the text. Both `findElementByText` and `findElementBySelector` accept an optional `within` parameter for scoping.
- The overlay cursor (`#__demo-cursor`) and keystroke container (`#__demo-keys`) are injected as fixed-position DOM elements. All overlay positioning accounts for CSS `zoom`. Overlay appearance is customizable via the `OverlayTheme` parameter.
- `Recorder.start()` resolves ffmpeg via `ensureFfmpeg()` then calls `setActiveRecorder(this)` so `markEvent()` in actions can register click/key timestamps for sound mixing.
- `Recorder.stop()` checks the output file extension: `.mp4` (H.264, default), `.webm` (VP9), or `.gif` (palette-based).
- Sound assets (click.wav, key.wav) are auto-generated via ffmpeg on first use and cached in `~/.webreel/assets/`.
- Frames are written to `~/.webreel/frames/` during recording and cleaned up after encoding.
- Chrome and ffmpeg are auto-downloaded on first use if not found on the system. Binaries are cached in `~/.webreel/bin/`. Override with `CHROME_PATH` / `FFMPEG_PATH` env vars.

### Adding a new action

1. Add the function to `src/actions.ts`, taking `CDPClient` as the first parameter.
2. Export it from `src/index.ts`.
3. If the action should produce a sound, call `markEvent("click" | "key")`.
4. Add a corresponding step type to the CLI (see below).

## webreel CLI

Built with Commander. Entry point: `src/index.ts` (has shebang).

| Command     | Source                      | Description                                 |
| ----------- | --------------------------- | ------------------------------------------- |
| `init`      | `src/commands/init.ts`      | Scaffold a webreel.config.json              |
| `record`    | `src/commands/record.ts`    | Record videos to MP4/GIF/WebM               |
| `preview`   | `src/commands/preview.ts`   | Run in visible browser without recording    |
| `composite` | `src/commands/composite.ts` | Re-composite from stored raw video/timeline |
| `validate`  | `src/commands/validate.ts`  | Check config for errors                     |

### CLI flags

- All commands: `-c, --config <path>` to specify a custom config file (default: `webreel.config.json`).
- `record --verbose` / `preview --verbose`: Log each step before execution.
- `record --watch`: Re-record when the config file changes (debounced 300ms).
- `record [videos...]`: Filter to specific video names.
- `preview [video]`: Preview a specific video (defaults to first).

### Runner (`src/lib/runner.ts`)

`runVideo(config, options?)` orchestrates the full lifecycle: launch Chrome, set viewport, navigate, inject overlays (with optional theme), optionally start recording, execute steps, stop recording.

Options: `{ record?: boolean; verbose?: boolean }`.

The step execution loop is a `for` loop with `try/catch` that adds step index, action name, and URL context to any errors. When `verbose` is true, each step is logged before execution.

### Adding a new step type

1. Add the interface to `src/lib/types.ts` and include it in the `Step` union.
2. Add a `case` to the step loop in `src/lib/runner.ts`.
3. Add validation logic for the new action in `src/lib/config.ts` `validateStep()`.
4. Add the action to `VALID_ACTIONS` in `config.ts`.
5. Add tests in `src/lib/__tests__/config.test.ts`.

### Config validation (`src/lib/config.ts`)

`validateWebreelConfig()` validates the `WebreelConfig` format and returns `{ path, message }` errors.

`loadWebreelConfig()` reads a config file and returns a `WebreelConfig`. The config must have a `videos` object mapping names to video configurations.

`resolveConfigPath()` resolves the config file path: uses the provided `--config` path, or defaults to `webreel.config.json` in the current directory.

Top-level `baseUrl`, `viewport`, `theme`, and `include` are inherited by videos that don't specify their own. `outDir` controls the output directory (defaults to `videos/`); video `output` paths are resolved relative to it. Timeline metadata is stored in `.webreel/timelines/` relative to the config file.

## Config format

### webreel.config.json

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "outDir": "./videos",
  "baseUrl": "https://myapp.com",
  "viewport": { "width": 1920, "height": 1080 },
  "videos": {
    "hero": {
      "url": "/",
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "text": "Get Started" }
      ]
    },
    "login": {
      "url": "/login",
      "output": "login-flow.mp4",
      "steps": [{ "action": "click", "text": "Sign In" }]
    }
  }
}
```

### Top-level fields

| Field      | Type                          | Default    | Required |
| ---------- | ----------------------------- | ---------- | -------- |
| `$schema`  | string                        | -          | no       |
| `outDir`   | string                        | `"videos"` | no       |
| `baseUrl`  | string                        | `""`       | no       |
| `viewport` | `{ width, height }`           | -          | no       |
| `theme`    | ThemeConfig                   | -          | no       |
| `include`  | string[]                      | -          | no       |
| `videos`   | `Record<string, VideoConfig>` | -          | yes      |

### Per-video fields

Each key in the `videos` object is the video name (used as default output filename).

| Field       | Type                  | Default      | Required |
| ----------- | --------------------- | ------------ | -------- |
| `url`       | string                | -            | yes      |
| `baseUrl`   | string                | inherited    | no       |
| `viewport`  | `{ width, height }`   | inherited    | no       |
| `zoom`      | number                | -            | no       |
| `waitFor`   | string (CSS selector) | -            | no       |
| `output`    | string                | `<name>.mp4` | no       |
| `thumbnail` | number \| false       | `0`          | no       |
| `include`   | string[]              | inherited    | no       |
| `theme`     | ThemeConfig           | inherited    | no       |
| `steps`     | Step[]                | -            | yes      |

### Step types

| Action       | Required fields                               | Optional fields                                          |
| ------------ | --------------------------------------------- | -------------------------------------------------------- |
| `pause`      | `ms`                                          | -                                                        |
| `click`      | `text` or `selector`                          | `within`, `modifiers`                                    |
| `key`        | `key`                                         | `label`                                                  |
| `drag`       | `from`, `to` (each with `text` or `selector`) | `within` on from/to                                      |
| `moveTo`     | `text` or `selector`                          | `within`                                                 |
| `type`       | `text`                                        | `target` (click target first), `delay` (ms between keys) |
| `scroll`     | -                                             | `x`, `y`, `selector` (element to scroll), `within`       |
| `wait`       | `selector` or `text`                          | `timeout` (default 30000)                                |
| `screenshot` | `output`                                      | -                                                        |

### Theme config

| Field                    | Type   | Default    | Description                          |
| ------------------------ | ------ | ---------- | ------------------------------------ |
| `theme.cursor`           | string | built-in   | Path to a custom cursor SVG file     |
| `theme.cursorSize`       | number | 24         | Size of the cursor overlay in pixels |
| `theme.hud.background`   | string | see code   | HUD background CSS value             |
| `theme.hud.color`        | string | see code   | HUD text color                       |
| `theme.hud.fontSize`     | number | 56         | HUD font size in pixels              |
| `theme.hud.fontFamily`   | string | Geist, ... | HUD font family                      |
| `theme.hud.borderRadius` | number | 18         | HUD border radius in pixels          |
| `theme.hud.position`     | string | `"bottom"` | `"top"` or `"bottom"`                |

### JSON Schema

A JSON Schema is available at `https://webreel.dev/schema/v1.json` (served from `apps/docs/public/schema/v1.json`). Add `"$schema": "https://webreel.dev/schema/v1.json"` to `webreel.config.json` for IDE autocompletion.

## Testing

Tests use Vitest. Test files live in `src/lib/__tests__/` within the webreel CLI package. Run with `pnpm test` from root or `npx vitest run` from the package.

## Publishing

Uses `@changesets/cli` for versioning and publishing. Workflow:

1. `pnpm changeset` to create a changeset describing the change.
2. Merge to `main`. The release GitHub Action creates a "Version Packages" PR.
3. Merging the version PR triggers `changeset publish` to npm.

## Conventions

- ESM-only with `.js` import extensions in source.
- No emojis in code, comments, documentation, or commit messages.
- Use latest npm package versions when adding dependencies.
- Chrome, ffmpeg, sound assets, and temp frames are stored under `~/.webreel/` in the user's home directory. Override Chrome/ffmpeg with `CHROME_PATH` / `FFMPEG_PATH` env vars.
- Lint with `pnpm lint`, format with `pnpm format`.
- CI runs lint, format check, type check, build, and tests via GitHub Actions.
- Use `<table>` HTML elements instead of markdown tables in `.mdx` files in the docs app.
