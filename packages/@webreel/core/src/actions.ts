import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CDPClient, BoundingBox } from "./types.js";
import { OFFSCREEN_MARGIN, DEFAULT_VIEWPORT_SIZE } from "./types.js";
import { showKeys, hideKeys } from "./overlays.js";
import { animateMoveTo, computeEasedPath, computeDragTiming } from "./cursor-motion.js";
import type { InteractionTimeline } from "./timeline.js";

function getTimeline(ctx: RecordingContext): InteractionTimeline {
  const tl = ctx.timeline;
  if (!tl) throw new Error("Expected timeline to be set during recording");
  return tl;
}

export class RecordingContext {
  private _mode: "record" | "preview" = "preview";
  private _timeline: InteractionTimeline | null = null;
  private _recorder: { addEvent: (type: "click" | "key") => void } | null = null;
  private _cursorX = -OFFSCREEN_MARGIN;
  private _cursorY = -OFFSCREEN_MARGIN;
  private _clickDwell: number | undefined;

  get mode(): "record" | "preview" {
    return this._mode;
  }

  setMode(mode: "record" | "preview"): void {
    this._mode = mode;
  }

  get timeline(): InteractionTimeline | null {
    return this._timeline;
  }

  setTimeline(timeline: InteractionTimeline | null): void {
    this._timeline = timeline;
  }

  setRecorder(recorder: { addEvent: (type: "click" | "key") => void } | null): void {
    this._recorder = recorder;
  }

  get cursorX(): number {
    return this._cursorX;
  }

  get cursorY(): number {
    return this._cursorY;
  }

  setCursorPosition(x: number, y: number): void {
    this._cursorX = x;
    this._cursorY = y;
  }

  get isRecording(): boolean {
    return this._mode === "record" && this._timeline !== null;
  }

  resetCursorPosition(cssWidth?: number, cssHeight?: number): void {
    const w = cssWidth ?? DEFAULT_VIEWPORT_SIZE;
    const h = cssHeight ?? DEFAULT_VIEWPORT_SIZE;
    const edge = Math.floor(Math.random() * 4);
    const along = 0.2 + Math.random() * 0.6;
    switch (edge) {
      case 0:
        this._cursorX = along * w;
        this._cursorY = -OFFSCREEN_MARGIN;
        break;
      case 1:
        this._cursorX = w + OFFSCREEN_MARGIN;
        this._cursorY = along * h;
        break;
      case 2:
        this._cursorX = along * w;
        this._cursorY = h + OFFSCREEN_MARGIN;
        break;
      case 3:
        this._cursorX = -OFFSCREEN_MARGIN;
        this._cursorY = along * h;
        break;
    }
  }

  setClickDwell(ms: number | undefined): void {
    this._clickDwell = ms;
  }

  getClickDwellMs(): number {
    if (this._clickDwell !== undefined) return this._clickDwell;
    return 80 + Math.random() * 100;
  }

  getCursorPosition(): { x: number; y: number } {
    return { x: this._cursorX, y: this._cursorY };
  }

  markEvent(type: "click" | "key"): void {
    if (this.isRecording) {
      this._timeline?.addEvent(type);
    }
    this._recorder?.addEvent(type);
  }
}

export function modKey(): string {
  return process.platform === "darwin" ? "cmd" : "ctrl";
}

export async function pause(ms = 1200): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function navigate(client: CDPClient, url: string): Promise<void> {
  const loadPromise = client.Page.loadEventFired();
  await client.Page.navigate({ url });
  await loadPromise;
}

export async function waitForSelector(
  client: CDPClient,
  selector: string,
  timeoutMs = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { result } = await client.Runtime.evaluate({
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true,
    });
    if (result.value === true) return;
    await pause(200);
  }
  throw new Error(`Timeout waiting for selector "${selector}" after ${timeoutMs}ms`);
}

export async function waitForText(
  client: CDPClient,
  text: string,
  within?: string,
  timeoutMs = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await findElementByText(client, text, within)) return;
    await pause(200);
  }
  throw new Error(`Timeout waiting for text "${text}" after ${timeoutMs}ms`);
}

export async function findElementByText(
  client: CDPClient,
  text: string,
  within?: string,
): Promise<BoundingBox | null> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const scope = ${within ? `document.querySelector(${JSON.stringify(within)})` : "document.body"};
      if (!scope) return null;
      const target = ${JSON.stringify(text)};
      let best = null;
      let bestArea = Infinity;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent || !node.textContent.includes(target)) continue;
        let el = node.parentElement;
        while (el && el !== scope) {
          if (el.textContent && el.textContent.includes(target)) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              const area = r.width * r.height;
              if (area < bestArea) {
                bestArea = area;
                best = { x: r.x, y: r.y, width: r.width, height: r.height };
              }
            }
          }
          el = el.parentElement;
        }
      }
      return best;
    })()`,
    returnByValue: true,
  });
  return (result.value as BoundingBox) ?? null;
}

export async function findElementBySelector(
  client: CDPClient,
  selector: string,
  within?: string,
): Promise<BoundingBox | null> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const scope = ${within ? `document.querySelector(${JSON.stringify(within)})` : "document"};
      if (!scope) return null;
      const el = scope.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`,
    returnByValue: true,
  });
  return (result.value as BoundingBox) ?? null;
}

export async function moveCursorTo(
  ctx: RecordingContext,
  client: CDPClient,
  x: number,
  y: number,
): Promise<void> {
  await animateMoveTo(ctx, client, ctx.cursorX, ctx.cursorY, x, y);
  ctx.setCursorPosition(x, y);
  await pause(40 + Math.random() * 30);
}

async function cursorDown(ctx: RecordingContext, client: CDPClient): Promise<void> {
  if (ctx.isRecording) {
    getTimeline(ctx).setCursorScale(0.75);
    return;
  }
  await client.Runtime.evaluate({
    expression: `(() => {
      const el = document.getElementById("__demo-cursor");
      if (!el) return;
      el.getAnimations().forEach(a => a.cancel());
      const cx = el.dataset.cx || "0";
      const cy = el.dataset.cy || "0";
      el.style.transform = "translate(" + cx + "px," + cy + "px) scale(0.75)";
      el.style.transition = "transform 0.1s ease";
    })()`,
  });
}

async function cursorUp(ctx: RecordingContext, client: CDPClient): Promise<void> {
  if (ctx.isRecording) {
    getTimeline(ctx).setCursorScale(1);
    return;
  }
  await client.Runtime.evaluate({
    expression: `(() => {
      const el = document.getElementById("__demo-cursor");
      if (!el) return;
      el.getAnimations().forEach(a => a.cancel());
      const cx = el.dataset.cx || "0";
      const cy = el.dataset.cy || "0";
      el.style.transform = "translate(" + cx + "px," + cy + "px) scale(1)";
      el.style.transition = "transform 0.1s ease";
      setTimeout(() => { el.style.transition = ""; }, 120);
    })()`,
  });
}

export function resolveMod(mod: string): string {
  if (mod.toLowerCase() === "mod") {
    return process.platform === "darwin" ? "cmd" : "ctrl";
  }
  return mod;
}

export function modifierFlag(mod: string): number {
  switch (resolveMod(mod).toLowerCase()) {
    case "alt":
      return 1;
    case "ctrl":
    case "control":
      return 2;
    case "cmd":
    case "meta":
      return 4;
    case "shift":
      return 8;
    default:
      return 0;
  }
}

export function modifiersToFlag(mods?: string[]): number {
  if (!mods) return 0;
  let flag = 0;
  for (const m of mods) flag |= modifierFlag(m.toLowerCase());
  return flag;
}

export function modLabel(mod: string): string {
  const m = resolveMod(mod).toLowerCase();
  if (m === "cmd" || m === "meta") return "\u2318";
  if (m === "ctrl" || m === "control") return "Ctrl";
  if (m === "shift") return "\u21E7";
  if (m === "alt") return "\u2325";
  return mod;
}

interface ModKeyInfo {
  key: string;
  code: string;
  keyCode: number;
  location: number;
}

export function modKeyInfo(mod: string): ModKeyInfo | null {
  switch (resolveMod(mod).toLowerCase()) {
    case "cmd":
    case "meta":
      return { key: "Meta", code: "MetaLeft", keyCode: 91, location: 1 };
    case "ctrl":
    case "control":
      return { key: "Control", code: "ControlLeft", keyCode: 17, location: 1 };
    case "shift":
      return { key: "Shift", code: "ShiftLeft", keyCode: 16, location: 1 };
    case "alt":
      return { key: "Alt", code: "AltLeft", keyCode: 18, location: 1 };
    default:
      return null;
  }
}

export async function clickAt(
  ctx: RecordingContext,
  client: CDPClient,
  x: number,
  y: number,
  modifiers?: string[],
): Promise<void> {
  const flag = modifiersToFlag(modifiers);
  const labels: string[] = [];
  if (modifiers?.length) {
    for (const m of modifiers) labels.push(modLabel(m));
    if (ctx.isRecording) {
      getTimeline(ctx).showHud(labels);
    } else {
      await showKeys(client, labels);
    }
  }

  await moveCursorTo(ctx, client, x, y);

  const dwellMs = ctx.getClickDwellMs();
  if (dwellMs > 0) await pause(dwellMs);

  if (modifiers?.length) {
    for (const mod of modifiers) {
      const info = modKeyInfo(mod);
      if (info) {
        await client.Input.dispatchKeyEvent({
          type: "keyDown",
          key: info.key,
          code: info.code,
          windowsVirtualKeyCode: info.keyCode,
          modifiers: flag,
        });
      }
    }
    await pause(30);
  }

  await client.Input.dispatchMouseEvent({
    type: "mouseMoved",
    x,
    y,
    modifiers: flag,
  });
  await cursorDown(ctx, client);
  await pause(100);
  ctx.markEvent("click");

  const metaFlag = (flag & 4) !== 0;
  const ctrlFlag = (flag & 2) !== 0;
  const shiftFlag = (flag & 8) !== 0;
  const altFlag = (flag & 1) !== 0;

  // Prevent CDP-triggered mouse events from reaching app JS handlers, while
  // preserving native browser behaviors (focus changes, selection clearing,
  // caret placement). CDP's Input.dispatchMouseEvent is unreliable for JS
  // event delivery and often drops modifier flags. We block propagation to
  // app code but skip preventDefault so Chrome still performs default actions.
  await client.Runtime.evaluate({
    expression: `(() => {
      var events = ['pointerdown','mousedown','pointerup','mouseup','click'];
      events.forEach(function(evt) {
        document.addEventListener(evt, function __wrBlock(e) {
          if (e.__wrSynthetic) return;
          e.stopImmediatePropagation();
          document.removeEventListener(evt, __wrBlock, true);
        }, true);
      });
    })()`,
  });

  // CDP mousePressed/mouseReleased for native focus management (the events
  // themselves are suppressed above, but Chrome still updates internal focus)
  await client.Input.dispatchMouseEvent({
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
    modifiers: flag,
  });
  await pause(50);
  await client.Input.dispatchMouseEvent({
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
    modifiers: flag,
  });

  await pause(30);

  // Dispatch the full mouse event chain via JS with correct modifier flags
  await client.Runtime.evaluate({
    expression: `(() => {
      var el = document.elementFromPoint(${x}, ${y});
      if (!el) return;
      if (!${shiftFlag}) {
        var sel = window.getSelection();
        if (sel && sel.rangeCount) {
          var cp = document.caretPositionFromPoint(${x}, ${y});
          if (cp) {
            var cr = document.createRange();
            cr.setStart(cp.offsetNode, cp.offset);
            cr.collapse(true);
            sel.removeAllRanges(); sel.addRange(cr); sel.collapseToStart();
          } else {
            sel.removeAllRanges();
          }
        }
      }
      var opts = {
        bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y},
        metaKey: ${metaFlag}, ctrlKey: ${ctrlFlag}, shiftKey: ${shiftFlag}, altKey: ${altFlag},
        button: 0, buttons: 1
      };
      function fire(Ctor, type) {
        var ev = new Ctor(type, opts);
        ev.__wrSynthetic = true;
        el.dispatchEvent(ev);
      }
      fire(PointerEvent, 'pointerdown');
      fire(MouseEvent, 'mousedown');
      fire(PointerEvent, 'pointerup');
      fire(MouseEvent, 'mouseup');
      fire(MouseEvent, 'click');
    })()`,
  });

  await pause(30);
  await cursorUp(ctx, client);

  if (modifiers?.length) {
    for (const mod of modifiers) {
      const info = modKeyInfo(mod);
      if (info) {
        await client.Input.dispatchKeyEvent({
          type: "keyUp",
          key: info.key,
          code: info.code,
          windowsVirtualKeyCode: info.keyCode,
        });
      }
    }
    await pause(400);
    if (ctx.isRecording) {
      getTimeline(ctx).hideHud();
    } else {
      await hideKeys(client);
    }
  }
}

export const KEY_CODES: Record<string, { code: string; keyCode: number }> = {
  Delete: { code: "Delete", keyCode: 46 },
  Backspace: { code: "Backspace", keyCode: 8 },
  Escape: { code: "Escape", keyCode: 27 },
  Enter: { code: "Enter", keyCode: 13 },
  Tab: { code: "Tab", keyCode: 9 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  a: { code: "KeyA", keyCode: 65 },
  b: { code: "KeyB", keyCode: 66 },
  c: { code: "KeyC", keyCode: 67 },
  d: { code: "KeyD", keyCode: 68 },
  v: { code: "KeyV", keyCode: 86 },
  x: { code: "KeyX", keyCode: 88 },
  z: { code: "KeyZ", keyCode: 90 },
};

export const SHORTCUT_COMMANDS: Record<string, string[]> = {
  "meta+a": ["selectAll"],
  "meta+c": ["copy"],
  "meta+x": ["cut"],
  "meta+v": ["paste"],
  "meta+z": ["undo"],
  "meta+shift+z": ["redo"],
  "ctrl+a": ["selectAll"],
  "ctrl+c": ["copy"],
  "ctrl+x": ["cut"],
  "ctrl+v": ["paste"],
  "ctrl+z": ["undo"],
  "ctrl+shift+z": ["redo"],
};

export function resolveCommands(
  modifiers: string[],
  mainKey: string,
): string[] | undefined {
  const parts = modifiers
    .map((m) => {
      const lower = resolveMod(m).toLowerCase();
      if (lower === "cmd" || lower === "meta") return "meta";
      return lower;
    })
    .sort();
  parts.push(mainKey.toLowerCase());
  return SHORTCUT_COMMANDS[parts.join("+")];
}

export async function pressKey(
  ctx: RecordingContext,
  client: CDPClient,
  key: string,
  label?: string,
): Promise<void> {
  const parts = key.split("+");
  const modifiers: string[] = [];
  let mainKey = "";

  for (const p of parts) {
    const lower = p.toLowerCase();
    if (["cmd", "ctrl", "meta", "control", "shift", "alt", "mod"].includes(lower)) {
      modifiers.push(p);
    } else {
      mainKey = p;
    }
  }

  if (!mainKey) {
    throw new Error(
      `pressKey requires a non-modifier key, got "${key}" (modifiers only)`,
    );
  }

  const displayParts: string[] = [];
  for (const m of modifiers) displayParts.push(modLabel(m));
  displayParts.push(label ?? mainKey);

  if (ctx.isRecording) {
    getTimeline(ctx).showHud(displayParts);
  } else {
    await showKeys(client, displayParts);
  }
  ctx.markEvent("key");

  const flag = modifiersToFlag(modifiers);
  const keyInfo = KEY_CODES[mainKey] ?? KEY_CODES[mainKey.toLowerCase()];
  const code = keyInfo?.code ?? `Key${mainKey.toUpperCase()}`;
  const keyCode = keyInfo?.keyCode ?? mainKey.toUpperCase().charCodeAt(0);
  const commands = resolveCommands(modifiers, mainKey);

  await client.Input.dispatchKeyEvent({
    type: "keyDown",
    key: mainKey,
    code,
    windowsVirtualKeyCode: keyCode,
    modifiers: flag,
    commands,
  });
  await client.Input.dispatchKeyEvent({
    type: "keyUp",
    key: mainKey,
    code,
    windowsVirtualKeyCode: keyCode,
    modifiers: flag,
  });

  await pause(800);
  if (ctx.isRecording) {
    getTimeline(ctx).hideHud();
  } else {
    await hideKeys(client);
  }
}

export const CHAR_CODES: Record<string, { code: string; keyCode: number }> = {
  " ": { code: "Space", keyCode: 32 },
  "0": { code: "Digit0", keyCode: 48 },
  "1": { code: "Digit1", keyCode: 49 },
  "2": { code: "Digit2", keyCode: 50 },
  "3": { code: "Digit3", keyCode: 51 },
  "4": { code: "Digit4", keyCode: 52 },
  "5": { code: "Digit5", keyCode: 53 },
  "6": { code: "Digit6", keyCode: 54 },
  "7": { code: "Digit7", keyCode: 55 },
  "8": { code: "Digit8", keyCode: 56 },
  "9": { code: "Digit9", keyCode: 57 },
  ";": { code: "Semicolon", keyCode: 186 },
  "=": { code: "Equal", keyCode: 187 },
  ",": { code: "Comma", keyCode: 188 },
  "-": { code: "Minus", keyCode: 189 },
  ".": { code: "Period", keyCode: 190 },
  "/": { code: "Slash", keyCode: 191 },
  "`": { code: "Backquote", keyCode: 192 },
  "[": { code: "BracketLeft", keyCode: 219 },
  "\\": { code: "Backslash", keyCode: 220 },
  "]": { code: "BracketRight", keyCode: 221 },
  "'": { code: "Quote", keyCode: 222 },
};

function humanDelay(base: number): number {
  const jitter = base * (0.6 + Math.random() * 0.9);
  if (Math.random() < 0.12) return jitter + base * 1.5 + Math.random() * base * 2;
  return jitter;
}

export async function typeText(
  ctx: RecordingContext,
  client: CDPClient,
  text: string,
  delayMs = 120,
): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charInfo = CHAR_CODES[char];
    const isLetter = /^[a-zA-Z]$/.test(char);

    let code: string;
    let keyCode: number;

    if (charInfo) {
      code = charInfo.code;
      keyCode = charInfo.keyCode;
    } else if (isLetter) {
      code = `Key${char.toUpperCase()}`;
      keyCode = char.toUpperCase().charCodeAt(0);
    } else {
      code = "";
      keyCode = 0;
    }

    await client.Input.dispatchKeyEvent({
      type: "rawKeyDown",
      key: char,
      code,
      windowsVirtualKeyCode: keyCode,
    });
    await client.Input.dispatchKeyEvent({
      type: "char",
      key: char,
      text: char,
    });
    await client.Input.dispatchKeyEvent({
      type: "keyUp",
      key: char,
      code,
      windowsVirtualKeyCode: keyCode,
    });
    ctx.markEvent("key");
    if (ctx.isRecording) {
      const waitStart = Date.now();
      await getTimeline(ctx).waitForNextTick();
      const tickElapsed = Date.now() - waitStart;
      const delay = humanDelay(delayMs);
      if (delay > tickElapsed) {
        await pause(delay - tickElapsed);
      }
    } else {
      await pause(humanDelay(delayMs));
    }
  }
}

export async function dragFromTo(
  ctx: RecordingContext,
  client: CDPClient,
  fromBox: BoundingBox,
  toBox: BoundingBox,
): Promise<void> {
  const fx = fromBox.x + fromBox.width / 2;
  const fy = fromBox.y + fromBox.height / 2;
  const tx = toBox.x + toBox.width / 2;
  const ty = toBox.y + toBox.height / 2;

  const isRecording = ctx.isRecording;

  await moveCursorTo(ctx, client, fx, fy);
  await cursorDown(ctx, client);
  ctx.markEvent("click");

  await client.Runtime.evaluate({
    expression: `(() => {
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";
      window.getSelection()?.removeAllRanges();
      const el = document.elementFromPoint(${fx}, ${fy});
      const src = el?.closest("[draggable]") || el;
      if (src) {
        const ghost = src.cloneNode(true);
        ghost.id = "__demo-drag-ghost";
        const rect = src.getBoundingClientRect();
        ghost.style.cssText = [
          "position:fixed",
          "z-index:999998",
          "pointer-events:none",
          "width:" + rect.width + "px",
          "height:" + rect.height + "px",
          "left:" + rect.left + "px",
          "top:" + rect.top + "px",
          "opacity:0.85",
          "transform:rotate(2deg) scale(1.03)",
          "box-shadow:0 12px 32px rgba(0,0,0,0.4)",
          "transition:opacity 0.15s ease",
        ].join(";");
        document.body.appendChild(ghost);
      }
    })()`,
  });

  await client.Input.dispatchMouseEvent({
    type: "mousePressed",
    x: fx,
    y: fy,
    button: "left",
    clickCount: 1,
  });

  await client.Runtime.evaluate({
    expression: `(() => {
      const el = document.elementFromPoint(${fx}, ${fy});
      if (el) el.dispatchEvent(new DragEvent("dragstart", {
        bubbles: true, cancelable: true, clientX: ${fx}, clientY: ${fy},
        dataTransfer: new DataTransfer(),
      }));
    })()`,
  });

  await pause(150);

  const dist = Math.sqrt((tx - fx) * (tx - fx) + (ty - fy) * (ty - fy));
  const { steps, delayMs } = computeDragTiming(dist);
  const waypoints = computeEasedPath(fx, fy, tx, ty, steps);

  for (const wp of waypoints) {
    await client.Input.dispatchMouseEvent({
      type: "mouseMoved",
      x: wp.x,
      y: wp.y,
      button: "left",
      buttons: 1,
    });

    await client.Runtime.evaluate({
      expression: `(() => {
        const el = document.elementFromPoint(${wp.x}, ${wp.y});
        if (el) el.dispatchEvent(new DragEvent("dragover", {
          bubbles: true, cancelable: true, clientX: ${wp.x}, clientY: ${wp.y},
          dataTransfer: new DataTransfer(),
        }));
        const ghost = document.getElementById("__demo-drag-ghost");
        if (ghost) {
          ghost.style.left = "${wp.x - fromBox.width / 2}px";
          ghost.style.top = "${wp.y - fromBox.height / 2}px";
        }
        ${
          isRecording
            ? ""
            : `
        const cursor = document.getElementById("__demo-cursor");
        if (cursor) {
          cursor.getAnimations().forEach(a => a.cancel());
          cursor.style.transform = "translate(${wp.x}px,${wp.y}px)";
          cursor.dataset.cx = "${wp.x}";
          cursor.dataset.cy = "${wp.y}";
        }`
        }
      })()`,
    });
    if (isRecording) {
      getTimeline(ctx).setCursorPath([{ x: wp.x, y: wp.y }]);
    }

    await pause(delayMs + (Math.random() - 0.5) * 8);
  }

  await client.Runtime.evaluate({
    expression: `(() => {
      const el = document.elementFromPoint(${tx}, ${ty});
      if (el) {
        el.dispatchEvent(new DragEvent("dragover", {
          bubbles: true, cancelable: true, clientX: ${tx}, clientY: ${ty},
          dataTransfer: new DataTransfer(),
        }));
        el.dispatchEvent(new DragEvent("drop", {
          bubbles: true, cancelable: true, clientX: ${tx}, clientY: ${ty},
          dataTransfer: new DataTransfer(),
        }));
      }
    })()`,
  });

  await pause(50);

  await client.Runtime.evaluate({
    expression: `(() => {
      const el = document.elementFromPoint(${fx}, ${fy});
      if (el) el.dispatchEvent(new DragEvent("dragend", {
        bubbles: true, cancelable: true, clientX: ${tx}, clientY: ${ty},
        dataTransfer: new DataTransfer(),
      }));
      const ghost = document.getElementById("__demo-drag-ghost");
      if (ghost) {
        ghost.style.opacity = "0";
        setTimeout(() => ghost.remove(), 200);
      }
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    })()`,
  });

  await client.Input.dispatchMouseEvent({
    type: "mouseReleased",
    x: tx,
    y: ty,
    button: "left",
    clickCount: 1,
  });

  ctx.setCursorPosition(tx, ty);
  await cursorUp(ctx, client);
}

export async function captureScreenshot(
  client: CDPClient,
  outputPath: string,
): Promise<void> {
  const { data } = await client.Page.captureScreenshot({ format: "png" });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(data, "base64"));
}
