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

# EXAMPLES_FILTER: optional space- or comma-separated list of example names.
# When set, only those examples are recorded. Unset/empty records all examples
# (current behavior).
FILTER_LIST=()
if [ -n "${EXAMPLES_FILTER:-}" ]; then
  # Normalize commas to spaces, then split on whitespace.
  IFS=', ' read -r -a FILTER_LIST <<<"${EXAMPLES_FILTER//,/ }"
fi

is_selected() {
  local name="$1"
  if [ ${#FILTER_LIST[@]} -eq 0 ]; then
    return 0
  fi
  local candidate
  for candidate in "${FILTER_LIST[@]}"; do
    if [ "$candidate" = "$name" ]; then
      return 0
    fi
  done
  return 1
}

for dir in "$EXAMPLES_DIR"/*/; do
  config="$dir/webreel.config.json"
  example="$(basename "$dir")"

  if [ ! -f "$config" ]; then
    continue
  fi

  if ! is_selected "$example"; then
    continue
  fi

  TOTAL=$((TOTAL + 1))

  echo ""
  echo "--- Recording: $example ---"
  if (cd "$dir" && node "$WEBREEL" record) && bash "$SCRIPT_DIR/assert-video.sh" "$dir" "$example"; then
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
  if [ "${SKIP_SYNC:-}" = "1" ]; then
    echo ""
    echo "SKIP_SYNC=1 set; skipping sync-examples.sh."
  else
    echo ""
    echo "Syncing to docs app..."
    bash "$SCRIPT_DIR/sync-examples.sh"
  fi
fi
