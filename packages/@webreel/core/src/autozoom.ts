import type { BoundingBox } from "./types.js";

export interface AutoZoomConfig {
  enabled: boolean;
  approachS?: number;
  settleBeforeS?: number;
  holdAfterS?: number;
  releaseS?: number;
  paddingRatio?: number;
  minZoomRatio?: number;
  skipZoomRatio?: number;
  sessionGapS?: number;
  minPanS?: number;
}

export interface ZoomEvent {
  timeMs: number;
  box: BoundingBox;
  url?: string;
  // Optional: extend the camera hold until at least this time. Used for type
  // actions where `timeMs` anchors on the input click (so the camera arrives
  // in time) but the hold must cover the typing span, which ends later.
  holdUntilMs?: number;
}

export interface ZoomKeyframe {
  timeS: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

type ResolvedConfig = {
  approachS: number;
  settleBeforeS: number;
  holdAfterS: number;
  releaseS: number;
  paddingRatio: number;
  minZoomRatio: number;
  skipZoomRatio: number;
  sessionGapS: number;
  minPanS: number;
};

const DEFAULTS: ResolvedConfig = {
  approachS: 0.5,
  settleBeforeS: 0.15,
  holdAfterS: 0.3,
  releaseS: 0.5,
  paddingRatio: 0.3,
  minZoomRatio: 0.6,
  skipZoomRatio: 0.75,
  sessionGapS: 4.0,
  minPanS: 0.8,
};

export function unionBboxes(boxes: BoundingBox[]): BoundingBox | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function centerCropWithin(
  cx: number,
  cy: number,
  w: number,
  h: number,
  viewport: { width: number; height: number },
): { x: number; y: number; w: number; h: number } {
  return {
    w,
    h,
    x: Math.max(0, Math.min(viewport.width - w, cx - w / 2)),
    y: Math.max(0, Math.min(viewport.height - h, cy - h / 2)),
  };
}

export function computeCropForEvent(
  box: BoundingBox,
  viewport: { width: number; height: number },
  cfg: ResolvedConfig,
): { x: number; y: number; w: number; h: number } | null {
  let w = box.width * (1 + 2 * cfg.paddingRatio);
  let h = box.height * (1 + 2 * cfg.paddingRatio);

  w = Math.max(w, viewport.width * cfg.minZoomRatio);
  h = Math.max(h, viewport.height * cfg.minZoomRatio);

  const aspect = viewport.width / viewport.height;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;

  w = Math.min(w, viewport.width);
  h = Math.min(h, viewport.height);

  if (
    w >= viewport.width * cfg.skipZoomRatio &&
    h >= viewport.height * cfg.skipZoomRatio
  ) {
    return null;
  }

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return centerCropWithin(cx, cy, w, h, viewport);
}

export function generateZoomKeyframes(
  events: ZoomEvent[],
  viewport: { width: number; height: number },
  durationS: number,
  userCfg: AutoZoomConfig,
): ZoomKeyframe[] {
  if (!userCfg.enabled) return [];
  const cfg: ResolvedConfig = { ...DEFAULTS, ...userCfg };

  interface Target {
    timeS: number;
    holdUntilS: number;
    box: BoundingBox;
    crop: { x: number; y: number; w: number; h: number };
  }

  const targets: Target[] = [];
  let prevUrl: string | undefined;
  for (const e of events) {
    if (e.url && prevUrl && e.url !== prevUrl) {
      prevUrl = e.url;
      continue;
    }
    const crop = computeCropForEvent(e.box, viewport, cfg);
    prevUrl = e.url ?? prevUrl;
    if (!crop) continue;
    const timeS = e.timeMs / 1000;
    const holdUntilS = Math.max(timeS, (e.holdUntilMs ?? e.timeMs) / 1000);
    targets.push({ timeS, holdUntilS, box: e.box, crop });
  }

  if (targets.length === 0) return [];

  const full = { x: 0, y: 0, w: viewport.width, h: viewport.height };

  // Group targets by sessionGapS. Events within a short gap (default 1.2s —
  // button-click → modal case) form one session; anything further apart gets
  // its own pulse so the camera releases all the way back to wide between.
  const sessions: Target[][] = [[targets[0]]];
  for (let i = 1; i < targets.length; i++) {
    const prev = targets[i - 1];
    const curr = targets[i];
    if (curr.timeS - prev.timeS <= cfg.sessionGapS) {
      sessions[sessions.length - 1].push(curr);
    } else {
      sessions.push(curr === prev ? [] : [curr]);
    }
  }

  // Spatial sub-grouping within a session. We greedily extend the current
  // sub-group with each next target as long as the union bbox of the
  // sub-group still fits into a crop (doesn't trigger skipZoomRatio). If it
  // won't fit, we close the current sub-group and start a new one with this
  // target. Each sub-group shares ONE union crop, so the camera holds stable
  // within a sub-group and pans between sub-groups. This matches Cursor:
  // button+menu or trigger+modal stay in one frame; distinct regions of the
  // page get distinct zoom positions.
  type Group = { targets: Target[]; crop: Target["crop"] };
  for (const session of sessions) {
    if (session.length < 2) continue;
    const first = session[0];
    const groups: Group[] = [{ targets: [first], crop: first.crop }];
    for (let i = 1; i < session.length; i++) {
      const curr = session[i];
      const last = groups[groups.length - 1];
      const candidateBoxes = last.targets.map((t) => t.box).concat([curr.box]);
      const candidateUnion = unionBboxes(candidateBoxes);
      const candidateCrop = candidateUnion
        ? computeCropForEvent(candidateUnion, viewport, cfg)
        : null;
      if (candidateCrop) {
        last.targets.push(curr);
        last.crop = candidateCrop;
      } else {
        groups.push({ targets: [curr], crop: curr.crop });
      }
    }
    for (const g of groups) for (const t of g.targets) t.crop = g.crop;

    // Size-harmonize across sub-groups so crop zoom stays constant while the
    // camera pans between them.
    let maxW = 0;
    let maxH = 0;
    for (const t of session) {
      if (t.crop.w > maxW) maxW = t.crop.w;
      if (t.crop.h > maxH) maxH = t.crop.h;
    }
    for (const t of session) {
      if (t.crop.w === maxW && t.crop.h === maxH) continue;
      const cx = t.crop.x + t.crop.w / 2;
      const cy = t.crop.y + t.crop.h / 2;
      t.crop = centerCropWithin(cx, cy, maxW, maxH, viewport);
    }
  }

  const kf: ZoomKeyframe[] = [{ timeS: 0, ...full }];
  for (const session of sessions) {
    const first = session[0];
    const actualLast = session[session.length - 1];

    const settleTime = first.timeS - cfg.settleBeforeS;
    const approachStart = Math.max(0, settleTime - cfg.approachS);
    kf.push({ timeS: approachStart, ...full });
    kf.push({ timeS: Math.max(0, settleTime), ...first.crop });

    // Track the last target we actually panned to. Skip intermediate targets
    // whose pan duration would be shorter than cfg.minPanS — blink-and-miss
    // transitions that add visual noise without being readable. Also skip
    // when the next target's crop is identical to the current one (the
    // union-crop case): no pan to emit, just keep tracking lastKept so the
    // release time extends to cover the session's full span.
    let lastKept = first;
    for (let i = 1; i < session.length; i++) {
      const curr = session[i];
      const sameCrop =
        curr.crop.x === lastKept.crop.x &&
        curr.crop.y === lastKept.crop.y &&
        curr.crop.w === lastKept.crop.w &&
        curr.crop.h === lastKept.crop.h;
      if (sameCrop) {
        lastKept = curr;
        continue;
      }
      const gap = curr.timeS - lastKept.timeS;
      const arriveBy = curr.timeS - cfg.settleBeforeS;
      const holdEnd = Math.min(lastKept.timeS + gap * 0.4, arriveBy - 0.1);
      const panDuration = arriveBy - holdEnd;
      if (panDuration < cfg.minPanS) continue;

      if (holdEnd > lastKept.timeS + 0.05) {
        kf.push({ timeS: holdEnd, ...lastKept.crop });
      }
      kf.push({ timeS: Math.max(holdEnd + 0.05, arriveBy), ...curr.crop });
      lastKept = curr;
    }

    // Release uses the session's true last event for TIMING (so hold is
    // sized correctly) but the last position we actually panned to for
    // the CROP (otherwise release would teleport to a never-visited spot).
    // holdUntilS carries a per-event hold extension (e.g. typing spans from
    // click to last keystroke — the camera should stay on the field until
    // typing actually ends, not just for holdAfterS after the click).
    const holdEnd = actualLast.holdUntilS + cfg.holdAfterS;
    const releaseEnd = holdEnd + cfg.releaseS;
    kf.push({ timeS: holdEnd, ...lastKept.crop });
    kf.push({ timeS: releaseEnd, ...full });
  }

  return kf;
}

export function buildAutoZoomFilter(
  events: ZoomEvent[],
  viewport: { width: number; height: number },
  cssZoom: number,
  durationS: number,
  fps: number,
  userCfg: AutoZoomConfig,
): string | null {
  if (!userCfg.enabled || events.length === 0) return null;

  const scaled: ZoomEvent[] = events.map((e) => ({
    ...e,
    box: {
      x: e.box.x * cssZoom,
      y: e.box.y * cssZoom,
      width: e.box.width * cssZoom,
      height: e.box.height * cssZoom,
    },
  }));

  const kf = generateZoomKeyframes(scaled, viewport, durationS, userCfg);
  if (kf.length < 2) return null;

  if (process.env.WEBREEL_DEBUG_ZOOM) {
    for (const k of kf) {
      const z = (viewport.width / Math.max(1, k.w)).toFixed(2);
      console.error(
        `kf t=${k.timeS.toFixed(2)}s  z=${z}x  crop=${k.x.toFixed(0)},${k.y.toFixed(0)} ${k.w.toFixed(0)}×${k.h.toFixed(0)}`,
      );
    }
  }

  const zExpr = easedBetweens(kf, (k) => viewport.width / Math.max(1, k.w));
  const xExpr = easedBetweens(kf, (k) => k.x);
  const yExpr = easedBetweens(kf, (k) => k.y);
  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${viewport.width}x${viewport.height}:fps=${fps}`;
}

// Smoothstep easing between keyframes: p² × (3 − 2p). Uses FFmpeg expression
// register slots to compute the eased progress once per frame, then lerp at
// the eased position. Each segment is a single smoothstep (velocity zero at
// both ends) — since we no longer insert mid-motion waypoints, every segment
// is a standalone motion from a hold to the next hold, which is the shape
// smoothstep handles best.
function easedBetweens(kf: ZoomKeyframe[], val: (k: ZoomKeyframe) => number): string {
  if (kf.length === 1) return val(kf[0]).toFixed(4);
  let expr = "";
  let segments = 0;
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i];
    const b = kf[i + 1];
    if (b.timeS === a.timeS) continue;
    const va = val(a);
    const vb = val(b);
    const dt = b.timeS - a.timeS;
    const t0 = a.timeS.toFixed(3);
    const t1 = b.timeS.toFixed(3);
    const dtS = dt.toFixed(3);
    const v0 = va.toFixed(4);
    const delta = (vb - va).toFixed(4);
    const seg =
      `if(between(in_time,${t0},${t1}),` +
      `0*st(0,(in_time-${t0})/${dtS})+` +
      `0*st(1,ld(0)*ld(0)*(3-2*ld(0)))+` +
      `${v0}+(${delta})*ld(1)`;
    expr = expr ? `${expr},${seg}` : seg;
    segments++;
  }
  const tail = val(kf[kf.length - 1]).toFixed(4);
  return `${expr},${tail}${")".repeat(segments)}`;
}
