import { describe, it, expect } from "vitest";
import {
  buildAutoZoomFilter,
  computeCropForEvent,
  generateZoomKeyframes,
  unionBboxes,
  type AutoZoomConfig,
  type ZoomEvent,
} from "./autozoom.js";

const DEFAULTS = {
  approachS: 0.5,
  settleBeforeS: 0.15,
  holdAfterS: 0.3,
  releaseS: 0.5,
  paddingRatio: 0.3,
  minZoomRatio: 0.6,
  skipZoomRatio: 0.75,
  sessionGapS: 4.0,
  minPanS: 0.8,
} as const;

const VIEWPORT = { width: 1920, height: 1080 };

describe("unionBboxes", () => {
  it("unions two disjoint boxes", () => {
    const u = unionBboxes([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 100, y: 100, width: 20, height: 20 },
    ]);
    expect(u).toEqual({ x: 0, y: 0, width: 120, height: 120 });
  });

  it("returns the outer box when one contains another", () => {
    const u = unionBboxes([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 10, y: 10, width: 20, height: 20 },
    ]);
    expect(u).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("returns null for empty input", () => {
    expect(unionBboxes([])).toBeNull();
  });
});

describe("computeCropForEvent", () => {
  it("enforces minZoomRatio for tiny targets", () => {
    const crop = computeCropForEvent(
      { x: 100, y: 100, width: 10, height: 10 },
      VIEWPORT,
      DEFAULTS,
    );
    expect(crop).not.toBeNull();
    expect(crop!.w).toBeGreaterThanOrEqual(VIEWPORT.width * DEFAULTS.minZoomRatio);
    expect(crop!.h).toBeGreaterThanOrEqual(VIEWPORT.height * DEFAULTS.minZoomRatio);
  });

  it("returns null when target fills most of viewport (skipZoomRatio)", () => {
    const crop = computeCropForEvent(
      { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
      VIEWPORT,
      DEFAULTS,
    );
    expect(crop).toBeNull();
  });

  it("matches viewport aspect ratio", () => {
    const crop = computeCropForEvent(
      { x: 200, y: 200, width: 300, height: 300 },
      VIEWPORT,
      DEFAULTS,
    );
    const aspect = VIEWPORT.width / VIEWPORT.height;
    expect(crop).not.toBeNull();
    expect(crop!.w / crop!.h).toBeCloseTo(aspect, 3);
  });

  it("clamps crop to viewport edges", () => {
    const crop = computeCropForEvent(
      { x: 0, y: 0, width: 20, height: 20 },
      VIEWPORT,
      DEFAULTS,
    );
    expect(crop).not.toBeNull();
    expect(crop!.x).toBe(0);
    expect(crop!.y).toBe(0);
    expect(crop!.x + crop!.w).toBeLessThanOrEqual(VIEWPORT.width);
    expect(crop!.y + crop!.h).toBeLessThanOrEqual(VIEWPORT.height);
  });
});

describe("generateZoomKeyframes", () => {
  const cfg: AutoZoomConfig = { enabled: true };

  it("returns empty when disabled", () => {
    const kf = generateZoomKeyframes(
      [{ timeMs: 1000, box: { x: 100, y: 100, width: 200, height: 200 } }],
      VIEWPORT,
      5,
      { enabled: false },
    );
    expect(kf).toEqual([]);
  });

  it("returns empty when no events", () => {
    expect(generateZoomKeyframes([], VIEWPORT, 5, cfg)).toEqual([]);
  });

  it("generates approach/settle/hold/release keyframes for a single event", () => {
    const events: ZoomEvent[] = [
      { timeMs: 3000, box: { x: 500, y: 400, width: 200, height: 200 } },
    ];
    const kf = generateZoomKeyframes(events, VIEWPORT, 10, cfg);
    expect(kf.length).toBeGreaterThanOrEqual(5);
    expect(kf[0].timeS).toBe(0);
    expect(kf[0].w).toBe(VIEWPORT.width);
    expect(kf[kf.length - 1].w).toBe(VIEWPORT.width);
  });

  it("skips a click after a url change (navigation)", () => {
    const events: ZoomEvent[] = [
      {
        timeMs: 1000,
        box: { x: 100, y: 100, width: 200, height: 200 },
        url: "https://a.test/",
      },
      {
        timeMs: 3000,
        box: { x: 500, y: 500, width: 200, height: 200 },
        url: "https://b.test/",
      },
    ];
    const kfBoth = generateZoomKeyframes(events, VIEWPORT, 10, cfg);
    const kfFirstOnly = generateZoomKeyframes([events[0]], VIEWPORT, 10, cfg);
    expect(kfBoth.length).toBe(kfFirstOnly.length);
  });

  it("merges events within sessionGapS into one session (no release between)", () => {
    const events: ZoomEvent[] = [
      { timeMs: 2000, box: { x: 100, y: 100, width: 200, height: 200 } },
      { timeMs: 3000, box: { x: 900, y: 500, width: 200, height: 200 } },
    ];
    const kf = generateZoomKeyframes(events, VIEWPORT, 10, cfg);
    const zoomedOuts = kf.filter((k) => k.w === VIEWPORT.width);
    // Two events, 1s gap (< sessionGapS=1.2) → single session → 3 full-view
    // keyframes (initial, approach start, final release).
    expect(zoomedOuts.length).toBe(3);
  });

  it("starts a new session when gap exceeds sessionGapS", () => {
    const events: ZoomEvent[] = [
      { timeMs: 1000, box: { x: 100, y: 100, width: 200, height: 200 } },
      { timeMs: 9000, box: { x: 900, y: 500, width: 200, height: 200 } },
    ];
    const kf = generateZoomKeyframes(events, VIEWPORT, 15, cfg);
    const zoomedOuts = kf.filter((k) => k.w === VIEWPORT.width);
    // Two separate sessions → 5 full-view keyframes (each session adds
    // approach-start + release, plus one shared initial at t=0).
    expect(zoomedOuts.length).toBe(5);
  });

  it("emits monotonically-increasing keyframe times", () => {
    const events: ZoomEvent[] = [
      { timeMs: 1000, box: { x: 100, y: 100, width: 200, height: 200 } },
      { timeMs: 2000, box: { x: 900, y: 500, width: 200, height: 200 } },
      { timeMs: 8000, box: { x: 400, y: 300, width: 200, height: 200 } },
    ];
    const kf = generateZoomKeyframes(events, VIEWPORT, 20, cfg);
    for (let i = 1; i < kf.length; i++) {
      expect(kf[i].timeS).toBeGreaterThanOrEqual(kf[i - 1].timeS);
    }
  });

  it("keeps sessions separate across medium gaps (no mergeBuffer)", () => {
    // 6s gap: clearly beyond sessionGapS=4.0, so the sessions must NOT merge.
    // We want the camera to fully release between unrelated events.
    const events: ZoomEvent[] = [
      { timeMs: 1000, box: { x: 100, y: 100, width: 200, height: 200 } },
      { timeMs: 7000, box: { x: 900, y: 500, width: 200, height: 200 } },
    ];
    const kf = generateZoomKeyframes(events, VIEWPORT, 12, cfg);
    const zoomedOuts = kf.filter((k) => k.w === VIEWPORT.width);
    expect(zoomedOuts.length).toBe(5);
  });

  it("skips intermediate targets whose pan would be shorter than minPanS", () => {
    // Three events: A (t=2), B (t=2.5, 0.5s gap — below minPanS=0.8 after
    // hold), C (t=5, separate session). B gets dropped; A and C each form
    // their own session with distinct crops.
    const events: ZoomEvent[] = [
      { timeMs: 2000, box: { x: 200, y: 100, width: 200, height: 50 } },
      { timeMs: 2500, box: { x: 200, y: 300, width: 200, height: 50 } },
      { timeMs: 5000, box: { x: 1000, y: 600, width: 200, height: 50 } },
    ];
    const kf = generateZoomKeyframes(events, VIEWPORT, 10, cfg);
    const distinctCrops = new Set(
      kf.map((k) => `${k.x.toFixed(0)},${k.y.toFixed(0)},${k.w.toFixed(0)}`),
    );
    expect(distinctCrops.size).toBe(3);
  });

  it("uses last-kept crop for release when the final event is skipped by minPanS", () => {
    // Session with two events close together: B (t=4.5) and C (t=4.9, 0.4s
    // gap). C's pan is too short (< minPanS) so it's skipped; release should
    // use B's crop, not C's. Event A at t=2 is in its own earlier session.
    const events: ZoomEvent[] = [
      { timeMs: 2000, box: { x: 100, y: 100, width: 200, height: 50 } },
      { timeMs: 4500, box: { x: 800, y: 400, width: 200, height: 50 } },
      { timeMs: 4900, box: { x: 1500, y: 900, width: 200, height: 50 } },
    ];
    const kf = generateZoomKeyframes(events, VIEWPORT, 8, cfg);
    const lastCropKf = [...kf].reverse().find((k) => k.w !== VIEWPORT.width)!;
    // B is centered around x=800; C around x=1500. The last kept crop should
    // be positioned for B, not C — its left edge should be well under 1000.
    expect(lastCropKf.x).toBeLessThan(1000);
  });

  it("harmonizes crop size within a session so zoom level stays constant", () => {
    // A big target and a small target in the same session → small one should
    // inherit the big one's crop size (so the zoom doesn't jump).
    const events: ZoomEvent[] = [
      { timeMs: 1000, box: { x: 100, y: 100, width: 800, height: 400 } },
      { timeMs: 2000, box: { x: 1500, y: 800, width: 80, height: 30 } },
    ];
    const kf = generateZoomKeyframes(events, VIEWPORT, 5, cfg);
    const sessionCrops = kf.filter((k) => k.w !== VIEWPORT.width);
    const widths = new Set(sessionCrops.map((k) => k.w));
    expect(widths.size).toBe(1);
  });
});

describe("buildAutoZoomFilter", () => {
  it("returns null when disabled", () => {
    expect(buildAutoZoomFilter([], VIEWPORT, 1, 5, 60, { enabled: false })).toBeNull();
  });

  it("returns null when no events produce keyframes", () => {
    expect(buildAutoZoomFilter([], VIEWPORT, 1, 5, 60, { enabled: true })).toBeNull();
  });

  it("emits a zoompan filter string with expected params", () => {
    const events: ZoomEvent[] = [
      { timeMs: 2000, box: { x: 200, y: 200, width: 200, height: 200 } },
    ];
    const filter = buildAutoZoomFilter(events, VIEWPORT, 1, 10, 60, {
      enabled: true,
    });
    expect(filter).not.toBeNull();
    expect(filter!).toMatch(/^zoompan=z='/);
    expect(filter!).toContain(`s=${VIEWPORT.width}x${VIEWPORT.height}`);
    expect(filter!).toContain("fps=60");
  });

  it("emits smoothstep easing (register-based) in the filter expression", () => {
    const events: ZoomEvent[] = [
      { timeMs: 2000, box: { x: 200, y: 200, width: 200, height: 200 } },
    ];
    const filter = buildAutoZoomFilter(events, VIEWPORT, 1, 10, 60, {
      enabled: true,
    });
    expect(filter).not.toBeNull();
    // st(0, progress) and st(1, smoothstepped) and ld(1) usage
    expect(filter!).toContain("st(0,");
    expect(filter!).toContain("st(1,ld(0)*ld(0)*(3-2*ld(0)))");
    expect(filter!).toContain("*ld(1)");
  });

  it("scales event boxes by cssZoom before keyframe generation", () => {
    // Box big enough that the minZoomRatio floor doesn't clip both outputs to
    // the same crop — otherwise cssZoom=1 and cssZoom=2 both bottom out at the
    // minimum and look identical.
    const events: ZoomEvent[] = [
      { timeMs: 2000, box: { x: 100, y: 100, width: 500, height: 300 } },
    ];
    const filterAt1 = buildAutoZoomFilter(events, VIEWPORT, 1, 10, 60, {
      enabled: true,
    });
    const filterAt2 = buildAutoZoomFilter(events, VIEWPORT, 2, 10, 60, {
      enabled: true,
    });
    expect(filterAt1).not.toBe(filterAt2);
  });
});
