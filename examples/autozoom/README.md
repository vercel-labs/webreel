# Autozoom

Demonstrates cinematic autozoom that eases into each user action and releases afterwards. Small form fields and buttons benefit the most — on mobile viewports the effect makes details readable.

## Features demonstrated

- `autoZoom: true` — enable with defaults
- Multiple interactions grouped into zoom "sessions"
- Zoom settles before each click, holds through the action, releases at the end

## Run

```bash
cd examples/autozoom
webreel record
```

## Tuning

Pass an object instead of `true` to override defaults:

```json
{
  "autoZoom": {
    "enabled": true,
    "approachS": 1.2,
    "holdAfterS": 0.8,
    "paddingRatio": 0.4
  }
}
```
