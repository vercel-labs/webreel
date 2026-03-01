# Multi-Demo

Demonstrates defining multiple videos in a single config file, each producing its own output from the same page.

## Features demonstrated

- Multiple entries in the `videos` object
- Shared default `viewport` with per-video overrides
- Each video produces its own output file (`videos/homepage.mp4`, `videos/features.mp4`, `videos/pricing.mp4`)

## Run

Record all videos at once:

```bash
cd examples/multi-demo
webreel record
```

Or record a specific video by name:

```bash
webreel record homepage
```
