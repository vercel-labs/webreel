import { resolve, dirname } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  type CDPClient,
  type BoundingBox,
  type OverlayTheme,
  RecordingContext,
  connectCDP,
  launchChrome,
  navigate,
  waitForSelector,
  waitForText,
  injectOverlays,
  pause,
  findElementByText,
  findElementBySelector,
  clickAt,
  pressKey,
  typeText,
  dragFromTo,
  moveCursorTo,
  captureScreenshot,
  Recorder,
  InteractionTimeline,
  compose,
  ensureFfmpeg,
  extractThumbnail,
  moveFileSync,
  DEFAULT_VIEWPORT_SIZE,
} from "@webreel/core";
import type { VideoConfig, Step, ElementTarget } from "./types.js";

export function formatStep(i: number, step: Step): string {
  const desc = "description" in step && step.description ? `: ${step.description}` : "";
  switch (step.action) {
    case "pause":
      return `[step ${i}] pause ${step.ms}ms${desc}`;
    case "click":
      return `[step ${i}] click ${step.text ? `text="${step.text}"` : `selector="${step.selector}"`}${desc}`;
    case "key":
      return `[step ${i}] key "${step.key}"${desc}`;
    case "type":
      return `[step ${i}] type "${step.text}"${desc}`;
    case "scroll":
      return `[step ${i}] scroll x=${step.x ?? 0} y=${step.y ?? 0}${desc}`;
    case "wait":
      return `[step ${i}] wait ${step.selector ? `selector="${step.selector}"` : `text="${step.text}"`}${desc}`;
    case "drag":
      return `[step ${i}] drag${desc}`;
    case "moveTo":
      return `[step ${i}] moveTo ${step.text ? `text="${step.text}"` : `selector="${step.selector}"`}${desc}`;
    case "screenshot":
      return `[step ${i}] screenshot "${step.output}"${desc}`;
    case "navigate":
      return `[step ${i}] navigate "${step.url}"${desc}`;
    case "hover":
      return `[step ${i}] hover ${step.text ? `text="${step.text}"` : `selector="${step.selector}"`}${desc}`;
    case "select":
      return `[step ${i}] select "${step.selector}" value="${step.value}"${desc}`;
    default: {
      const _exhaustive: never = step;
      return `[step ${i}] ${(_exhaustive as Step).action}`;
    }
  }
}

export function resolveKeyTarget(target: string | ElementTarget): string {
  if (typeof target === "string") return target;
  return target.selector ?? "";
}

async function resolveTarget(
  client: CDPClient,
  opts: { text?: string; selector?: string; within?: string },
): Promise<BoundingBox> {
  if (!opts.text && !opts.selector) {
    throw new Error(`resolveTarget requires "text" or "selector"`);
  }
  let box: BoundingBox | null = null;
  if (opts.text) {
    box = await findElementByText(client, opts.text, opts.within);
  } else if (opts.selector) {
    box = await findElementBySelector(client, opts.selector, opts.within);
  }
  if (!box) {
    const target = opts.text ? `text="${opts.text}"` : `selector="${opts.selector}"`;
    const scope = opts.within ? ` within "${opts.within}"` : "";
    throw new Error(`Element not found: ${target}${scope}`);
  }
  return box;
}

export function resolveUrl(url: string, baseUrl: string, configDir: string): string {
  if (url.startsWith("http") || url.startsWith("file://")) return url;
  const combined = `${baseUrl}${url}`;
  if (combined.startsWith("http") || combined.startsWith("file://")) return combined;
  return pathToFileURL(resolve(configDir, combined)).href;
}

export function randomPointInBox(
  box: BoundingBox,
  spread = 0.25,
): { x: number; y: number } {
  const center = 0.5 - spread / 2;
  return {
    x: box.x + box.width * (center + Math.random() * spread),
    y: box.y + box.height * (center + Math.random() * spread),
  };
}

export async function extractThumbnailIfConfigured(
  config: Pick<VideoConfig, "thumbnail">,
  outputPath: string,
): Promise<void> {
  if (config.thumbnail?.enabled === false) return;
  const thumbTime = config.thumbnail?.time ?? 0;
  const thumbPath = outputPath.replace(/\.[^.]+$/, ".png");
  const ffmpegPath = await ensureFfmpeg();
  extractThumbnail(ffmpegPath, outputPath, thumbPath, thumbTime);
  console.log(`Thumbnail: ${thumbPath}`);
}

export interface RunVideoOptions {
  record?: boolean;
  verbose?: boolean;
  configDir?: string;
  frames?: boolean;
}

export async function runVideo(
  config: VideoConfig,
  options?: RunVideoOptions,
): Promise<void> {
  const shouldRecord = options?.record ?? true;
  const verbose = options?.verbose ?? false;
  const saveFrames = options?.frames ?? false;
  const configDir = options?.configDir ?? process.cwd();

  console.log(`${shouldRecord ? "Recording" : "Previewing"}: ${config.name}`);

  const width = config.viewport?.width ?? DEFAULT_VIEWPORT_SIZE;
  const height = config.viewport?.height ?? DEFAULT_VIEWPORT_SIZE;
  const zoom = config.zoom ?? 1;
  const cssWidth = Math.round(width / zoom);
  const cssHeight = Math.round(height / zoom);

  const ctx = new RecordingContext();
  ctx.resetCursorPosition(cssWidth, cssHeight);
  if (config.clickDwell !== undefined) ctx.setClickDwell(config.clickDwell);
  const initialCursor = ctx.getCursorPosition();

  const chrome = await launchChrome({ headless: shouldRecord });
  let clientRef: CDPClient | null = null;
  let recorder: Recorder | null = null;

  try {
    const client = await connectCDP(chrome.port);
    clientRef = client;
    await client.Page.enable();
    await client.Runtime.enable();
    // In headless recording mode, --enable-begin-frame-control means Chrome
    // won't render anything on its own. We start a background frame pump that
    // keeps the page alive (JS execution, animations) until the Recorder
    // takes over with its own beginFrame calls in captureLoop.
    let framePumpRunning = false;
    let framePumpBusy = false;
    let framePumpTimer: ReturnType<typeof setInterval> | null = null;
    if (shouldRecord) {
      await client.HeadlessExperimental.enable();
      framePumpRunning = true;
      framePumpTimer = setInterval(async () => {
        if (!framePumpRunning || framePumpBusy) return;
        framePumpBusy = true;
        try {
          await client.HeadlessExperimental.beginFrame();
        } catch {
          // Client may be closed or recorder may have taken over
        }
        framePumpBusy = false;
      }, 16);
    }
    await client.Emulation.setDeviceMetricsOverride({
      width: cssWidth,
      height: cssHeight,
      deviceScaleFactor: zoom,
      mobile: false,
    });

    const baseUrl = config.baseUrl ?? "";
    const url = resolveUrl(config.url, baseUrl, configDir);

    await navigate(client, url);

    if (config.waitFor) {
      if (typeof config.waitFor === "string") {
        await waitForSelector(client, config.waitFor);
      } else if (config.waitFor.selector) {
        await waitForSelector(client, config.waitFor.selector);
      } else if (config.waitFor.text) {
        await waitForText(client, config.waitFor.text, config.waitFor.within);
      }
    }

    await pause(200);

    let overlayTheme: OverlayTheme | undefined;
    let cursorSvg: string | undefined;
    const cursorConfig = config.theme?.cursor;
    if (config.theme) {
      overlayTheme = {
        cursorSize: cursorConfig?.size,
        cursorHotspot: cursorConfig?.hotspot,
        hud: config.theme.hud,
      };
      if (cursorConfig?.image) {
        try {
          cursorSvg = readFileSync(resolve(configDir, cursorConfig.image), "utf-8");
          overlayTheme.cursorSvg = cursorSvg;
        } catch {
          throw new Error(
            `Failed to read cursor SVG: ${resolve(configDir, cursorConfig.image)}`,
          );
        }
      }
    }

    let timeline: InteractionTimeline | null = null;
    const outputPath =
      config.output ?? resolve(configDir, "videos", `${config.name}.mp4`);

    if (shouldRecord) {
      ctx.setMode("record");
      timeline = new InteractionTimeline(width, height, {
        zoom,
        fps: config.fps,
        initialCursor,
        cursorSvg,
        cursorSize: cursorConfig?.size,
        cursorHotspot: cursorConfig?.hotspot,
        hud: config.theme?.hud,
      });
      ctx.setTimeline(timeline);

      const crf =
        config.quality !== undefined
          ? Math.round(51 * (1 - config.quality / 100))
          : undefined;
      const framesDir = saveFrames
        ? resolve(configDir, ".webreel", "frames", config.name)
        : undefined;
      recorder = new Recorder(width, height, {
        fps: config.fps,
        crf,
        framesDir,
        sfx: config.sfx,
      });
      recorder.setTimeline(timeline);

      // Stop the background frame pump before handing control to the
      // recorder's captureLoop, which will call beginFrame itself.
      framePumpRunning = false;
      if (framePumpTimer) {
        clearInterval(framePumpTimer);
        framePumpTimer = null;
      }
      // Wait for any in-flight beginFrame to finish
      while (framePumpBusy) {
        await pause(5);
      }

      await recorder.start(client, outputPath, ctx);
    } else {
      ctx.setMode("preview");
      ctx.setTimeline(null);
      await injectOverlays(client, overlayTheme, initialCursor);
    }

    await pause(500);

    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      if (verbose) console.log(formatStep(i, step));

      try {
        switch (step.action) {
          case "pause":
            await pause(step.ms);
            break;

          case "click": {
            const box = await resolveTarget(client, step);
            const { x: cx, y: cy } = randomPointInBox(box);
            await clickAt(ctx, client, cx, cy, step.modifiers);
            break;
          }

          case "key": {
            if (step.target) {
              const sel = resolveKeyTarget(step.target);
              if (sel) {
                await client.Runtime.evaluate({
                  expression: `document.querySelector(${JSON.stringify(sel)})?.focus()`,
                });
                await pause(100);
              }
            }
            await pressKey(ctx, client, step.key, step.label);
            break;
          }

          case "drag": {
            const fromBox = await resolveTarget(client, step.from);
            const toBox = await resolveTarget(client, step.to);
            await dragFromTo(ctx, client, fromBox, toBox);
            break;
          }

          case "type": {
            if (step.selector) {
              const box = await resolveTarget(client, step);
              const { x: tx, y: ty } = randomPointInBox(box);
              await clickAt(ctx, client, tx, ty);
              await client.Runtime.evaluate({
                expression: `document.querySelector(${JSON.stringify(step.selector)})?.focus()`,
              });
              await pause(300 + Math.random() * 200);
            }
            await typeText(ctx, client, step.text, step.charDelay);
            break;
          }

          case "scroll": {
            const scrollX = step.x ?? 0;
            const scrollY = step.y ?? 0;
            if (step.selector) {
              const withinScope = step.within
                ? `document.querySelector(${JSON.stringify(step.within)})`
                : "document";
              await client.Runtime.evaluate({
                expression: `(() => {
                  const scope = ${withinScope};
                  const target = scope?.querySelector(${JSON.stringify(step.selector)});
                  if (target) target.scrollBy({ left: ${scrollX}, top: ${scrollY}, behavior: "smooth" });
                })()`,
              });
            } else if (step.text) {
              const box = await resolveTarget(client, step);
              await client.Runtime.evaluate({
                expression: `(() => {
                  const el = document.elementFromPoint(${Math.round(box.x + box.width / 2)}, ${Math.round(box.y + box.height / 2)});
                  if (el) el.scrollBy({ left: ${scrollX}, top: ${scrollY}, behavior: "smooth" });
                })()`,
              });
            } else {
              await client.Runtime.evaluate({
                expression: `window.scrollBy({ left: ${scrollX}, top: ${scrollY}, behavior: "smooth" })`,
              });
            }
            await pause(500);
            break;
          }

          case "wait": {
            if (step.selector) {
              const scopedSelector = step.within
                ? `${step.within} ${step.selector}`
                : step.selector;
              await waitForSelector(client, scopedSelector, step.timeout);
            } else if (step.text) {
              await waitForText(client, step.text, step.within, step.timeout);
            }
            break;
          }

          case "screenshot": {
            await captureScreenshot(client, resolve(configDir, step.output));
            break;
          }

          case "moveTo": {
            const box = await resolveTarget(client, step);
            const { x: mx, y: my } = randomPointInBox(box, 0.1);
            await moveCursorTo(ctx, client, mx, my);
            break;
          }

          case "navigate": {
            const navUrl = resolveUrl(step.url, config.baseUrl ?? "", configDir);
            await navigate(client, navUrl);
            break;
          }

          case "hover": {
            const box = await resolveTarget(client, step);
            const { x: hx, y: hy } = randomPointInBox(box, 0.1);
            await moveCursorTo(ctx, client, hx, hy);
            await client.Input.dispatchMouseEvent({
              type: "mouseMoved",
              x: hx,
              y: hy,
            });
            break;
          }

          case "select": {
            if (step.selector) {
              const withinScope = step.within
                ? `document.querySelector(${JSON.stringify(step.within)})`
                : "document";
              await client.Runtime.evaluate({
                expression: `(() => {
                  const scope = ${withinScope};
                  const el = scope?.querySelector(${JSON.stringify(step.selector)});
                  if (!el) throw new Error("Element not found: " + ${JSON.stringify(step.selector)});
                  el.value = ${JSON.stringify(step.value)};
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                })()`,
              });
            } else if (step.text) {
              const box = await resolveTarget(client, step);
              await client.Runtime.evaluate({
                expression: `(() => {
                  const el = document.elementFromPoint(${Math.round(box.x + box.width / 2)}, ${Math.round(box.y + box.height / 2)});
                  if (!el) throw new Error("Element not found by text: " + ${JSON.stringify(step.text)});
                  el.value = ${JSON.stringify(step.value)};
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                })()`,
              });
            } else {
              throw new Error(`select step requires "selector" or "text"`);
            }
            break;
          }
        }
        const stepDelay = "delay" in step ? step.delay : undefined;
        const postDelay = stepDelay ?? config.defaultDelay;
        if (postDelay !== undefined && postDelay > 0) {
          await pause(postDelay);
        }
      } catch (err) {
        throw new Error(
          `Step ${i} (${step.action}) failed at ${url}: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    }

    if (recorder) {
      const cleanVideoPath = recorder.getTempVideoPath();
      await recorder.stop();
      recorder = null;

      if (timeline) {
        const timelineData = timeline.toJSON();
        const metadataDir = resolve(configDir, ".webreel", "timelines");
        mkdirSync(metadataDir, { recursive: true });
        writeFileSync(
          resolve(metadataDir, `${config.name}.timeline.json`),
          JSON.stringify(timelineData),
        );

        const rawDir = resolve(configDir, ".webreel", "raw");
        mkdirSync(rawDir, { recursive: true });
        const rawVideoPath = resolve(rawDir, `${config.name}.mp4`);
        moveFileSync(cleanVideoPath, rawVideoPath);

        ctx.setMode("preview");
        ctx.setTimeline(null);
        mkdirSync(dirname(outputPath), { recursive: true });
        console.log(`Compositing overlays...`);
        await compose(rawVideoPath, timelineData, outputPath, { sfx: config.sfx });
      }
      await extractThumbnailIfConfigured(config, outputPath);

      console.log(`Done: ${outputPath}`);
    } else {
      console.log(`Preview complete: ${config.name}`);
    }
  } finally {
    if (recorder) {
      try {
        await recorder.stop();
      } catch (err) {
        console.warn("Failed to stop recorder:", err);
      }
    }
    if (clientRef) {
      try {
        await clientRef.close();
      } catch (err) {
        console.warn("Failed to close CDP client:", err);
      }
    }
    try {
      chrome.kill();
    } catch (err) {
      console.warn("Failed to kill Chrome process:", err);
    }
  }
}
