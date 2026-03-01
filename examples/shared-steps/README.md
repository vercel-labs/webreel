# Shared Steps

Demonstrates using `include` to share common setup steps across videos. The shared steps dismiss a cookie consent banner before the main video steps run.

## Features demonstrated

- Top-level `include` array referencing a JSON step file
- Shared `steps/setup.json` that waits for and dismisses a cookie banner
- Included steps are automatically prepended to every video

## Structure

```
shared-steps/
  webreel.config.json       Main config with include
  web/
    index.html             Page with a cookie consent banner
  steps/
    setup.json             Reusable steps (wait, dismiss banner)
```

## Run

```bash
cd examples/shared-steps
webreel record
```
