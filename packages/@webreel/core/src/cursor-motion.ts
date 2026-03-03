import type { CDPClient, Point } from "./types.js";
import { FRAME_MS, CAPTURE_CYCLE_MS } from "./types.js";
import type { RecordingContext } from "./actions.js";

/**
 * Fitts's law inspired duration: scales with sqrt of distance.
 * Returns milliseconds. Tuned so short moves feel quick but not
 * instant, and long cross-screen moves have enough frames to
 * appear smooth at the target capture rate.
 */
function moveDuration(distance: number): number {
  return 180 + 16 * Math.sqrt(distance) + (Math.random() - 0.5) * 30;
}

/**
 * Asymmetric ease-in-out: reaches 50% progress at 40% of elapsed time.
 * Acceleration is quadratic; deceleration is cubic (gentler settle-in).
 * C1-continuous at the inflection point.
 */
function humanEase(t: number): number {
  const mid = 0.4;
  if (t <= mid) {
    const s = t / mid;
    return 0.5 * s * s;
  }
  const s = (t - mid) / (1 - mid);
  return 0.5 + 0.5 * (1 - (1 - s) * (1 - s) * (1 - s));
}

function bezierControl(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dist: number,
): Point {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;

  if (dist < 80) return { x: mx, y: my };

  const px = -(y1 - y0) / dist;
  const py = (x1 - x0) / dist;
  const offset = dist * (0.03 + Math.random() * 0.07) * (Math.random() < 0.5 ? -1 : 1);

  return { x: mx + px * offset, y: my + py * offset };
}

function evalBezier(t: number, p0: Point, p1: Point, p2: Point): Point {
  const m = 1 - t;
  return {
    x: m * m * p0.x + 2 * m * t * p1.x + t * t * p2.x,
    y: m * m * p0.y + 2 * m * t * p1.y + t * t * p2.y,
  };
}

/**
 * Animate cursor from one position to another. Pre-computes the full
 * bezier path with easing and jitter, then registers a frame-based
 * tick function (window.__tickCursor) that the recorder calls before
 * every captureScreenshot. Each tick advances exactly one step through
 * the path, so every captured frame shows a smooth intermediate
 * position regardless of actual capture latency.
 */
export async function animateMoveTo(
  ctx: RecordingContext,
  client: CDPClient,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<void> {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return;

  const duration = moveDuration(dist);
  const ctrl = bezierControl(fromX, fromY, toX, toY, dist);
  const p0: Point = { x: fromX, y: fromY };
  const p2: Point = { x: toX, y: toY };

  const NUM_STEPS = Math.max(6, Math.round(duration / FRAME_MS));

  const positions: Array<{ x: number; y: number }> = [{ x: fromX, y: fromY }];
  for (let i = 1; i <= NUM_STEPS; i++) {
    const rawT = i / NUM_STEPS;
    const t = humanEase(rawT);
    const pos = evalBezier(t, p0, ctrl, p2);
    const jitter = dist > 60 ? microJitter(rawT, dist) : { x: 0, y: 0 };
    positions.push({
      x: Math.round((pos.x + jitter.x) * 10) / 10,
      y: Math.round((pos.y + jitter.y) * 10) / 10,
    });
  }
  positions[positions.length - 1] = { x: toX, y: toY };

  if (ctx.isRecording && ctx.timeline) {
    ctx.timeline.setCursorPath(positions);
    await new Promise((r) => setTimeout(r, NUM_STEPS * CAPTURE_CYCLE_MS));
    return;
  }

  await client.Runtime.evaluate({
    expression: `(() => {
      const el = document.getElementById("__demo-cursor");
      if (!el) return;
      const pts = ${JSON.stringify(positions)};
      let idx = 0;
      window.__tickCursor = function() {
        if (idx >= pts.length) { window.__tickCursor = null; return; }
        const p = pts[idx++];
        el.style.transform = "translate(" + p.x + "px," + p.y + "px)";
        el.dataset.cx = String(p.x);
        el.dataset.cy = String(p.y);
        if (idx >= pts.length) window.__tickCursor = null;
      };
      window.__tickCursor();
    })()`,
  });

  await new Promise((r) => setTimeout(r, NUM_STEPS * CAPTURE_CYCLE_MS));

  await client.Input.dispatchMouseEvent({
    type: "mouseMoved",
    x: toX,
    y: toY,
  });
}

function microJitter(t: number, dist: number): Point {
  const bell = Math.exp(-8 * (t - 0.5) * (t - 0.5));
  const mag = Math.min(0.4, dist * 0.0004) * bell;
  return {
    x: (Math.random() - 0.5) * 2 * mag,
    y: (Math.random() - 0.5) * 2 * mag,
  };
}

export function computeEasedPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps: number,
): Point[] {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return [{ x: toX, y: toY }];

  const ctrl = bezierControl(fromX, fromY, toX, toY, dist);
  const p0: Point = { x: fromX, y: fromY };
  const p2: Point = { x: toX, y: toY };

  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const rawT = i / steps;
    const t = humanEase(rawT);
    pts.push(evalBezier(t, p0, ctrl, p2));
  }

  pts[pts.length - 1] = { x: toX, y: toY };
  return pts;
}

export function computeDragTiming(distance: number): {
  steps: number;
  delayMs: number;
} {
  const duration = 300 + 20 * Math.sqrt(distance) + (Math.random() - 0.5) * 40;
  const steps = Math.max(12, Math.round(duration / 30));
  return { steps, delayMs: duration / steps };
}
