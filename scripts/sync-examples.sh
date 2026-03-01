#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXAMPLES_DIR="$ROOT_DIR/examples"
DOCS_VIDEOS="$ROOT_DIR/apps/docs/public/examples/videos"
DOCS_POSTERS="$ROOT_DIR/apps/docs/public/examples"

FFMPEG="${FFMPEG_PATH:-ffmpeg}"

mkdir -p "$DOCS_VIDEOS"

SYNCED=0

for dir in "$EXAMPLES_DIR"/*/; do
  name="$(basename "$dir")"

  # multi-demo produces multiple videos; use the first demo's output
  if [ "$name" = "multi-demo" ]; then
    src="$dir/videos/homepage.mp4"
    if [ -f "$src" ]; then
      cp "$src" "$DOCS_VIDEOS/multi-demo.mp4"
      "$FFMPEG" -y -i "$src" -frames:v 1 -q:v 2 "$DOCS_POSTERS/multi-demo.png" 2>/dev/null
      echo "[$name] Synced (from homepage.mp4)"
      SYNCED=$((SYNCED + 1))
    else
      echo "[$name] No video found, skipping."
    fi
    continue
  fi

  # Look for {name}.{ext} in the example dir or its videos/ subdirectory
  src=""
  for ext in mp4 gif webm; do
    if [ -f "$dir/$name.$ext" ]; then
      src="$dir/$name.$ext"
      break
    fi
    if [ -f "$dir/videos/$name.$ext" ]; then
      src="$dir/videos/$name.$ext"
      break
    fi
  done

  if [ -z "$src" ]; then
    echo "[$name] No video found, skipping."
    continue
  fi

  filename="$(basename "$src")"
  cp "$src" "$DOCS_VIDEOS/$filename"

  # Extract first frame as poster PNG
  "$FFMPEG" -y -i "$src" -frames:v 1 -q:v 2 "$DOCS_POSTERS/$name.png" 2>/dev/null

  echo "[$name] Synced $filename"
  SYNCED=$((SYNCED + 1))
done

echo ""
echo "Synced $SYNCED examples to apps/docs/public/examples/"

# --- Inject example videos into README files ---

START_MARKER="<!-- EXAMPLES:START -->"
END_MARKER="<!-- EXAMPLES:END -->"

find_video() {
  local dir="$1"
  local name="$2"

  if [ "$name" = "multi-demo" ] && [ -f "$dir/videos/homepage.mp4" ]; then
    echo "videos/homepage.mp4"
    return
  fi

  for ext in mp4 gif webm; do
    if [ -f "$dir/$name.$ext" ]; then
      echo "$name.$ext"
      return
    fi
    if [ -f "$dir/videos/$name.$ext" ]; then
      echo "videos/$name.$ext"
      return
    fi
  done

  for ext in mp4 gif webm; do
    local found
    found="$(find "$dir" -maxdepth 1 -name "*.$ext" -print -quit 2>/dev/null)"
    if [ -n "$found" ]; then
      echo "$(basename "$found")"
      return
    fi
    if [ -d "$dir/videos" ]; then
      found="$(find "$dir/videos" -maxdepth 1 -name "*.$ext" -print -quit 2>/dev/null)"
      if [ -n "$found" ]; then
        echo "videos/$(basename "$found")"
        return
      fi
    fi
  done
}

inject_examples() {
  local readme_file="$1"
  local prefix="$2"

  [ -f "$readme_file" ] || return
  grep -q "$START_MARKER" "$readme_file" || return

  local tmp
  tmp="$(mktemp)"

  for dir in "$EXAMPLES_DIR"/*/; do
    local name
    name="$(basename "$dir")"

    local video
    video="$(find_video "$dir" "$name")"
    [ -n "$video" ] || continue

    local desc=""
    if [ -f "$dir/README.md" ]; then
      desc="$(awk 'NR>1 && NF{print; exit}' "$dir/README.md")"
    fi

    {
      echo "**[${name}](${prefix}/${name})** -- ${desc}"
      echo ""
      echo "<video src=\"${prefix}/${name}/${video}\" controls muted width=\"100%\"></video>"
      echo ""
    } >> "$tmp"
  done

  local start_line end_line
  start_line=$(grep -n "$START_MARKER" "$readme_file" | head -1 | cut -d: -f1)
  end_line=$(grep -n "$END_MARKER" "$readme_file" | head -1 | cut -d: -f1)

  {
    head -n "$start_line" "$readme_file"
    echo ""
    cat "$tmp"
    tail -n +"$end_line" "$readme_file"
  } > "${readme_file}.tmp"
  mv "${readme_file}.tmp" "$readme_file"

  rm -f "$tmp"
}

inject_examples "$ROOT_DIR/README.md" "examples"
inject_examples "$ROOT_DIR/packages/webreel/README.md" "../../examples"
inject_examples "$ROOT_DIR/packages/@webreel/core/README.md" "../../../examples"

echo "Injected example videos into README files."
