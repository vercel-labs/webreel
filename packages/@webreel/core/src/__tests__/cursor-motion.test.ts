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

describe("computeDragTiming speed", () => {
  it("takes about half as long at twice the speed", () => {
    // The jitter term is +/-20ms, so compare totals over several samples.
    const total = (speed: number) => {
      let sum = 0;
      for (let i = 0; i < 40; i++) {
        const { steps, delayMs } = computeDragTiming(900, speed);
        sum += steps * delayMs;
      }
      return sum / 40;
    };
    const normal = total(1);
    const fast = total(2);
    expect(fast).toBeGreaterThan(normal / 2 - 30);
    expect(fast).toBeLessThan(normal / 2 + 30);
  });

  it("defaults to unchanged timing", () => {
    const a = computeDragTiming(400);
    const b = computeDragTiming(400, 1);
    expect(Math.abs(a.steps * a.delayMs - b.steps * b.delayMs)).toBeLessThan(60);
  });
});
