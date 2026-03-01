import { describe, it, expect } from "vitest";
import { computeEasedPath, computeDragTiming } from "../cursor-motion.js";

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
