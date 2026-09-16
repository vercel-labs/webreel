#!/bin/sh
set -e

DEPS_DIR="$(cd "$(dirname "$0")/.." && pwd)/deps"
STB_DIR="$DEPS_DIR/stb"
NANOSVG_DIR="$DEPS_DIR/nanosvg"

mkdir -p "$STB_DIR"
mkdir -p "$NANOSVG_DIR"

STB_BASE="https://raw.githubusercontent.com/nothings/stb/master"

if [ ! -f "$STB_DIR/stb_image.h" ]; then
  echo "Downloading stb_image.h..."
  curl -sL "$STB_BASE/stb_image.h" -o "$STB_DIR/stb_image.h"
fi

if [ ! -f "$STB_DIR/stb_truetype.h" ]; then
  echo "Downloading stb_truetype.h..."
  curl -sL "$STB_BASE/stb_truetype.h" -o "$STB_DIR/stb_truetype.h"
fi

if [ ! -f "$STB_DIR/stb_image_write.h" ]; then
  echo "Downloading stb_image_write.h..."
  curl -sL "$STB_BASE/stb_image_write.h" -o "$STB_DIR/stb_image_write.h"
fi

NANOSVG_BASE="https://raw.githubusercontent.com/memononen/nanosvg/master/src"

if [ ! -f "$NANOSVG_DIR/nanosvg.h" ]; then
  echo "Downloading nanosvg.h..."
  curl -sL "$NANOSVG_BASE/nanosvg.h" -o "$NANOSVG_DIR/nanosvg.h"
fi

if [ ! -f "$NANOSVG_DIR/nanosvgrast.h" ]; then
  echo "Downloading nanosvgrast.h..."
  curl -sL "$NANOSVG_BASE/nanosvgrast.h" -o "$NANOSVG_DIR/nanosvgrast.h"
fi

echo "Dependencies ready."
