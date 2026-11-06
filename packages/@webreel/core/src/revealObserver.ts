import type { BoundingBox, CDPClient } from "./types.js";

export interface RevealObserverHandle {
  id: number;
}

// Installed BEFORE an interaction fires. Snapshots which elements are
// currently visible so we can later tell what's newly revealed, then hooks a
// MutationObserver to the document body subtree. Returns a numeric id used
// to identify this observer when we collect.
const INSTALL_SCRIPT = `(() => {
  if (!window.__wrReveals) window.__wrReveals = {};
  if (!window.__wrRevealsNextId) window.__wrRevealsNextId = 0;
  const id = ++window.__wrRevealsNextId;
  const preVisible = new WeakSet();
  const preBounds = new WeakMap();
  // An element is "pre-visible" only if it's BOTH in layout AND actually
  // rendered (not hidden by opacity:0, visibility:hidden, display:none). We
  // use Element.checkVisibility when available because getBoundingClientRect
  // returns a non-zero rect for opacity:0 elements — those are elements we
  // DO want to detect as newly-revealed later.
  const isActuallyVisible = (el) => {
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
        contentVisibilityAuto: true,
      });
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const all = document.body.querySelectorAll('*');
  for (const el of all) {
    if (isActuallyVisible(el)) {
      preVisible.add(el);
      const r = el.getBoundingClientRect();
      preBounds.set(el, { x: r.left, y: r.top, w: r.width, h: r.height });
    }
  }
  const mutated = new Set();
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') {
        for (const n of r.addedNodes) if (n.nodeType === 1) mutated.add(n);
      } else if (r.type === 'attributes' && r.target.nodeType === 1) {
        mutated.add(r.target);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-expanded', 'open'],
  });
  window.__wrReveals[id] = { observer, preVisible, preBounds, mutated };
  return id;
})()`;

// Called AFTER the interaction + postDelay. Walks the mutated element set,
// decides which are newly visible or grew meaningfully, and returns their
// bounding boxes. Filters out our own recording overlay elements (prefixed
// with "__demo-"). Tiny mutations (< 100 px²) are dropped as noise.
const COLLECT_SCRIPT = `(id) => {
  const state = window.__wrReveals && window.__wrReveals[id];
  if (!state) return [];
  state.observer.disconnect();
  const MIN_AREA = 100;
  const GROWTH_MARGIN = 4;
  const reveals = [];
  for (const el of state.mutated) {
    if (!document.body.contains(el)) continue;
    if (el.id && el.id.indexOf('__demo-') === 0) continue;
    if (el.closest && el.closest('[id^="__demo-"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.width * r.height < MIN_AREA) continue;
    // Must be actually rendered now (not just laid-out-but-invisible).
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
        continue;
      }
    }
    const wasVisible = state.preVisible.has(el);
    if (!wasVisible) {
      reveals.push({ x: r.left, y: r.top, width: r.width, height: r.height });
      continue;
    }
    const prev = state.preBounds.get(el);
    if (!prev) continue;
    const grewLeft = prev.x - r.left > GROWTH_MARGIN;
    const grewTop = prev.y - r.top > GROWTH_MARGIN;
    const grewRight = (r.left + r.width) - (prev.x + prev.w) > GROWTH_MARGIN;
    const grewBottom = (r.top + r.height) - (prev.y + prev.h) > GROWTH_MARGIN;
    if (grewLeft || grewTop || grewRight || grewBottom) {
      reveals.push({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
  }
  delete window.__wrReveals[id];
  return reveals;
}`;

export async function installRevealObserver(
  client: CDPClient,
): Promise<RevealObserverHandle | null> {
  try {
    const { result } = await client.Runtime.evaluate({
      expression: INSTALL_SCRIPT,
      returnByValue: true,
    });
    if (typeof result.value === "number") return { id: result.value };
    return null;
  } catch {
    return null;
  }
}

function isBoundingBox(v: unknown): v is BoundingBox {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.x === "number" &&
    typeof b.y === "number" &&
    typeof b.width === "number" &&
    typeof b.height === "number"
  );
}

export async function collectReveals(
  client: CDPClient,
  handle: RevealObserverHandle,
): Promise<BoundingBox[]> {
  try {
    const { result } = await client.Runtime.evaluate({
      expression: `(${COLLECT_SCRIPT})(${handle.id})`,
      returnByValue: true,
    });
    if (Array.isArray(result.value)) return result.value.filter(isBoundingBox);
    return [];
  } catch {
    return [];
  }
}

export const __TESTING__ = { INSTALL_SCRIPT, COLLECT_SCRIPT };
