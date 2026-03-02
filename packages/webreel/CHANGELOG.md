# webreel

## 0.1.4

### Patch Changes

- Fix recording hang after final step. The recorder now properly resolves when all steps complete, preventing indefinite hangs during video capture.
- Updated dependencies
  - @webreel/core@0.1.4

## 0.1.3

### Patch Changes

- Add homepage and bugs URLs to package.json files. Fix README video embeds for GitHub LFS.
- Updated dependencies
  - @webreel/core@0.1.3

## 0.1.2

### Patch Changes

- Fix MP4 video encoding for iPhone compatibility. Add BT.709 color metadata and faststart flag to all H.264 output paths so videos can be saved to iOS photo gallery and start playback faster on the web.
- Updated dependencies
  - @webreel/core@0.1.2

## 0.1.1

### Patch Changes

- Fix published package: resolve `workspace:*` dependency to actual version.

## 0.1.0

### Minor Changes

- Initial release. Record scripted browser demos as MP4, GIF, or WebM with cursor animation, keystroke overlays, and sound effects.
