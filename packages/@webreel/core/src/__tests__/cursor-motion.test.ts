import { describe, it, expect, vi } from "vitest";
import { computeEasedPath, computeDragTiming, animateMoveTo } from "../cursor-motion.js";
import { RecordingContext } from "../actions.js";
import { InteractionTimeline } from "../timeline.js";
import type { CDPClient } from "../types.js";

function createMockClient() {
  return {
    Input: {
      dispatchMouseEvent: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as CDPClient & {
    Input: { dispatchMouseEvent: ReturnType<typeof vi.fn> };
  };
}

describe("computeEasedPath", () => {
  it("returns a single destination point when distance is < 1", () => {
    const pts = computeEasedPath(10, 10, 10.5, 10.5, 20);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toEqual({ x: 10.5, y: 10.5 });
  });

  it("returns the requested number of steps", () => {
    const pts = computeEasedPath(0, 0, 100, 100, 10);
    expect(pts).toHaveLength(10);
  });

  it("ends at the exact destination", () => {
    const pts = computeEasedPath(0, 0, 200, 300, 15);
    expect(pts[pts.length - 1]).toEqual({ x: 200, y: 300 });
  });

  it("intermediate points move generally toward the target", () => {
    const pts = computeEasedPath(0, 0, 500, 0, 20);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x).toBeGreaterThanOrEqual(pts[i - 1].x - 5);
    }
  });
});

describe("computeDragTiming", () => {
  it("returns at least 12 steps", () => {
    const { steps } = computeDragTiming(10);
    expect(steps).toBeGreaterThanOrEqual(12);
  });

  it("increases steps with distance", () => {
    const short = computeDragTiming(50);
    const long = computeDragTiming(1000);
    expect(long.steps).toBeGreaterThan(short.steps);
  });

  it("delayMs is positive", () => {
    const { delayMs } = computeDragTiming(200);
    expect(delayMs).toBeGreaterThan(0);
  });
});

describe("animateMoveTo (recording)", () => {
  it("does not dispatch mouseMoved until the cursor path is fully consumed by ticks", async () => {
    const ctx = new RecordingContext();
    ctx.setMode("record");
    const timeline = new InteractionTimeline(1080, 1080);
    ctx.setTimeline(timeline);
    const client = createMockClient();

    const movePromise = animateMoveTo(ctx, client, 0, 0, 100, 100);

    // setCursorPath runs synchronously before the first await inside
    // animateMoveTo, so the dispatch should not have fired yet.
    expect(client.Input.dispatchMouseEvent).not.toHaveBeenCalled();

    // Consume a couple of ticks -- deliberately short of the full path.
    timeline.tick();
    timeline.tick();
    await Promise.resolve();
    expect(client.Input.dispatchMouseEvent).not.toHaveBeenCalled();

    // Drive enough ticks to consume the rest of the path. The exact step
    // count depends on distance/jitter (see moveDuration), so over-tick
    // generously -- ticks after the path drains are harmless no-ops.
    for (let i = 0; i < 100; i++) timeline.tick();

    await movePromise;
    expect(client.Input.dispatchMouseEvent).toHaveBeenCalledWith({
      type: "mouseMoved",
      x: 100,
      y: 100,
    });
  });

  it("unblocks via releaseWaiters without needing the path to fully drain", async () => {
    const ctx = new RecordingContext();
    ctx.setMode("record");
    const timeline = new InteractionTimeline(1080, 1080);
    ctx.setTimeline(timeline);
    const client = createMockClient();

    const movePromise = animateMoveTo(ctx, client, 0, 0, 500, 500);

    // Consume only one point of a much longer path, then interrupt.
    timeline.tick();
    await Promise.resolve();
    expect(client.Input.dispatchMouseEvent).not.toHaveBeenCalled();

    timeline.releaseWaiters();

    await movePromise;
    expect(client.Input.dispatchMouseEvent).toHaveBeenCalledWith({
      type: "mouseMoved",
      x: 500,
      y: 500,
    });
  });
});
