#!/usr/bin/env bash
# Asserts that an example produced a valid recorded video/gif output.
#
# Usage: assert-video.sh <example-dir> <example-name>
#
# Checks every file under <example-dir>/videos/:
#   - the file exists and is larger than 20KB
#   - ffprobe (or `ffmpeg -i` as a fallback) reports a video stream with a
#     nonzero duration
#
# Resolves the same ffmpeg binary the CLI would use: FFMPEG_PATH env var,
# then the ~/.webreel cache, then whatever `ffmpeg`/`ffprobe` is on PATH.
set -uo pipefail

EXAMPLE_DIR="${1:?Usage: assert-video.sh <example-dir> <example-name>}"
EXAMPLE_NAME="${2:?Usage: assert-video.sh <example-dir> <example-name>}"
VIDEOS_DIR="$EXAMPLE_DIR/videos"
MIN_BYTES=20480 # 20KB

find_in_webreel_cache() {
  local name="$1"
  local cache_dir="$HOME/.webreel/bin/ffmpeg"
  [ -d "$cache_dir" ] || return 1

  if [ -x "$cache_dir/$name" ]; then
    echo "$cache_dir/$name"
    return 0
  fi

  local found
  found="$(find "$cache_dir" -type f -name "$name" -perm -u+x 2>/dev/null | head -n1)"
  if [ -n "$found" ]; then
    echo "$found"
    return 0
  fi
  return 1
}

resolve_ffprobe() {
  # Prefer a real ffprobe if one is available (most accurate stream parsing).
  if command -v ffprobe >/dev/null 2>&1; then
    command -v ffprobe
    return 0
  fi
  return 1
}

resolve_ffmpeg() {
  if [ -n "${FFMPEG_PATH:-}" ]; then
    echo "$FFMPEG_PATH"
    return 0
  fi
  if found="$(find_in_webreel_cache ffmpeg)"; then
    echo "$found"
    return 0
  fi
  if command -v ffmpeg >/dev/null 2>&1; then
    command -v ffmpeg
    return 0
  fi
  return 1
}

FFPROBE_BIN="$(resolve_ffprobe || true)"
FFMPEG_BIN="$(resolve_ffmpeg || true)"

if [ -z "$FFPROBE_BIN" ] && [ -z "$FFMPEG_BIN" ]; then
  echo "[$EXAMPLE_NAME] assert-video: no ffprobe or ffmpeg available to inspect output." >&2
  exit 1
fi

check_stream_and_duration() {
  local file="$1"
  if [ -n "$FFPROBE_BIN" ]; then
    local duration
    duration="$("$FFPROBE_BIN" -v error -select_streams v:0 -show_entries stream=codec_type \
      -show_entries format=duration -of default=noprint_wrappers=1 "$file" 2>/dev/null)"
    if ! echo "$duration" | grep -q "codec_type=video"; then
      echo "[$EXAMPLE_NAME] assert-video: $file has no video stream (ffprobe)." >&2
      return 1
    fi
    local dur_value
    dur_value="$(echo "$duration" | sed -n 's/^duration=//p' | head -n1)"
    if [ -z "$dur_value" ] || [ "$dur_value" = "N/A" ]; then
      echo "[$EXAMPLE_NAME] assert-video: $file has no duration reported (ffprobe)." >&2
      return 1
    fi
    if ! awk -v d="$dur_value" 'BEGIN { exit !(d > 0) }'; then
      echo "[$EXAMPLE_NAME] assert-video: $file has non-positive duration ($dur_value)." >&2
      return 1
    fi
    return 0
  fi

  # Fallback: parse `ffmpeg -i` stderr output.
  local info
  info="$("$FFMPEG_BIN" -i "$file" 2>&1 || true)"
  if ! echo "$info" | grep -q "Stream.*Video:"; then
    echo "[$EXAMPLE_NAME] assert-video: $file has no video stream (ffmpeg -i)." >&2
    return 1
  fi
  local dur_line
  dur_line="$(echo "$info" | grep -o "Duration: [0-9:.]*" | head -n1 | sed 's/Duration: //')"
  if [ -z "$dur_line" ] || [ "$dur_line" = "N/A" ]; then
    echo "[$EXAMPLE_NAME] assert-video: $file has no duration reported (ffmpeg -i)." >&2
    return 1
  fi
  if [ "$dur_line" = "00:00:00.00" ]; then
    echo "[$EXAMPLE_NAME] assert-video: $file has zero duration." >&2
    return 1
  fi
  return 0
}

if [ ! -d "$VIDEOS_DIR" ]; then
  echo "[$EXAMPLE_NAME] assert-video: videos dir not found: $VIDEOS_DIR" >&2
  exit 1
fi

# Only check actual video/gif outputs. The harness also drops a thumbnail
# .png alongside each recording, which is not a video and has no duration.
FILES=("$VIDEOS_DIR"/*.mp4 "$VIDEOS_DIR"/*.webm "$VIDEOS_DIR"/*.gif "$VIDEOS_DIR"/*.mov "$VIDEOS_DIR"/*.mkv)
FOUND_ANY=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] && FOUND_ANY=1 && break
done
if [ "$FOUND_ANY" -eq 0 ]; then
  echo "[$EXAMPLE_NAME] assert-video: no video/gif output files found in $VIDEOS_DIR" >&2
  exit 1
fi

STATUS=0
for file in "${FILES[@]}"; do
  [ -f "$file" ] || continue

  size=$(wc -c <"$file" | tr -d ' ')
  if [ "$size" -le "$MIN_BYTES" ]; then
    echo "[$EXAMPLE_NAME] assert-video: $file is only $size bytes (need > $MIN_BYTES)." >&2
    STATUS=1
    continue
  fi

  if ! check_stream_and_duration "$file"; then
    STATUS=1
    continue
  fi

  echo "[$EXAMPLE_NAME] assert-video: $file OK ($size bytes)."
done

exit $STATUS
