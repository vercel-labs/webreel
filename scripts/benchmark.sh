#!/usr/bin/env bash
set -euo pipefail

# Run on the same machine with localhost:1420 serving the app.
# Uses webreel.config.json which must output .gif to exercise the full pipeline.

DEMO="${1:-toolbar-demo}"
RUNS=3
CLI="node packages/webreel/dist/index.js"

now_ms() {
  if command -v gdate &>/dev/null; then
    echo $(($(gdate +%s%N) / 1000000))
  elif date +%s%N &>/dev/null 2>&1 && [ "$(date +%N)" != "%N" ]; then
    echo $(($(date +%s%N) / 1000000))
  else
    python3 -c 'import time; print(int(time.time()*1000))'
  fi
}

echo "=== webreel benchmark: $DEMO ==="
echo ""

for i in $(seq 1 "$RUNS"); do
  label="run $i"
  if [ "$i" -eq 1 ]; then
    label="run 1 (warmup)"
  fi

  start=$(now_ms)
  $CLI record "$DEMO" > /dev/null 2>&1
  rc=$?
  end=$(now_ms)

  if [ "$rc" -ne 0 ]; then
    echo "$label: FAILED (exit code $rc)"
    exit 1
  fi

  elapsed=$(echo "scale=2; ($end - $start) / 1000" | bc)
  echo "$label: ${elapsed}s"
done

echo ""
echo "=== output ==="
OUTPUT=$(find videos/ -name "$DEMO.*" -newer scripts/benchmark.sh 2>/dev/null | head -1)
if [ -n "$OUTPUT" ]; then
  SIZE=$(du -h "$OUTPUT" | cut -f1)
  echo "$OUTPUT: $SIZE"
fi
