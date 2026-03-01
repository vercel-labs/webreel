#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXAMPLES_DIR="$ROOT_DIR/examples"
WEBREEL="$ROOT_DIR/packages/webreel/dist/index.js"

if [ ! -f "$WEBREEL" ]; then
  echo "webreel CLI not built. Run 'pnpm build' first."
  exit 1
fi

FAILED=()
PASSED=0
TOTAL=0

for dir in "$EXAMPLES_DIR"/*/; do
  config="$dir/webreel.config.json"
  example="$(basename "$dir")"

  if [ ! -f "$config" ]; then
    continue
  fi

  TOTAL=$((TOTAL + 1))

  echo ""
  echo "--- Recording: $example ---"
  if (cd "$dir" && node "$WEBREEL" record); then
    echo "[$example] Done."
    PASSED=$((PASSED + 1))
  else
    echo "[$example] Failed."
    FAILED+=("$example")
  fi
done

echo ""
echo "=============================="
echo "Results: $PASSED/$TOTAL passed"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "Failed: ${FAILED[*]}"
  exit 1
else
  echo "All examples recorded successfully."
  echo ""
  echo "Syncing to docs app..."
  bash "$SCRIPT_DIR/sync-examples.sh"
fi
