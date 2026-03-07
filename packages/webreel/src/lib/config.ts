import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, isAbsolute, extname, relative } from "node:path";
import { parse as parseJsonc, parseTree, getNodePath } from "jsonc-parser";
import { createJiti } from "jiti";
import { glob, isDynamicPattern } from "tinyglobby";
import picomatch from "picomatch";
import type { VideoConfig, WebreelConfig, FullConfig } from "./types.js";
import { VIEWPORT_PRESETS } from "./types.js";

export const DEFAULT_CONFIG_NAME = "webreel.config";
export const DEFAULT_CONFIG_FILE = "webreel.config.json";
export const CURRENT_SCHEMA_VERSION = 1;

const CONFIG_EXTENSIONS = [".json", ".ts", ".mts", ".js", ".mjs"];
const JSON_EXTENSIONS = new Set([".json"]);

export function parseSchemaVersion(schema?: string): number {
  if (!schema) return CURRENT_SCHEMA_VERSION;
  const match = schema.match(/\/schema\/v(\d+)\.json/);
  if (!match) return -1;
  return parseInt(match[1], 10);
}

async function resolveIncludes(
  config: Record<string, unknown>,
  configDir: string,
  seen: Set<string>,
): Promise<unknown[]> {
  const includes = config.include;
  if (!Array.isArray(includes) || includes.length === 0) return [];

  const prependedSteps: unknown[] = [];

  for (const inc of includes) {
    if (typeof inc !== "string") continue;

    const absPath = resolve(configDir, inc);
    if (seen.has(absPath)) {
      throw new Error(`Circular include detected: ${absPath}`);
    }
    seen.add(absPath);

    const ext = extname(absPath);
    let parsed: Record<string, unknown>;

    if (JSON_EXTENSIONS.has(ext)) {
      let raw: string;
      try {
        raw = readFileSync(absPath, "utf-8");
      } catch (err) {
        throw new Error(`Include file not found: ${absPath}`, { cause: err });
      }
      parsed = parseJsonc(raw) as Record<string, unknown>;
    } else {
      try {
        let mod = await loadTsConfig(absPath);
        if (typeof mod === "object" && mod !== null && "default" in mod) {
          mod = (mod as Record<string, unknown>).default;
        }
        if (typeof mod !== "object" || mod === null) {
          throw new Error(`Include file must export an object: ${absPath}`);
        }
        parsed = mod as Record<string, unknown>;
      } catch (err) {
        if (err instanceof Error && err.message.includes("must export")) throw err;
        throw new Error(`Include file not found or failed to load: ${absPath}`, {
          cause: err,
        });
      }
    }

    if (!Array.isArray(parsed.steps)) {
      throw new Error(`Include file ${absPath} must export a "steps" array`);
    }

    const nestedSteps = await resolveIncludes(parsed, dirname(absPath), seen);
    prependedSteps.push(...nestedSteps, ...parsed.steps);
  }

  return prependedSteps;
}

function resolveSfxPaths(sfx: VideoConfig["sfx"], configDir: string): VideoConfig["sfx"] {
  if (!sfx) return sfx;
  const resolved = { ...sfx };
  if (typeof resolved.click === "string" && !isAbsolute(resolved.click)) {
    resolved.click = resolve(configDir, resolved.click);
  }
  if (typeof resolved.key === "string" && !isAbsolute(resolved.key)) {
    resolved.key = resolve(configDir, resolved.key);
  }
  return resolved;
}

function resolveVideoDefaults(
  video: VideoConfig,
  defaults: Partial<
    Pick<
      WebreelConfig,
      "baseUrl" | "viewport" | "theme" | "include" | "defaultDelay" | "clickDwell" | "sfx"
    >
  >,
  outDir: string | undefined,
  configDir: string,
): VideoConfig {
  const resolved = { ...video };
  if (!resolved.baseUrl && defaults.baseUrl) resolved.baseUrl = defaults.baseUrl;
  if (!resolved.viewport && defaults.viewport) resolved.viewport = defaults.viewport;
  if (defaults.theme) {
    resolved.theme = {
      cursor: { ...defaults.theme.cursor, ...resolved.theme?.cursor },
      hud: { ...defaults.theme.hud, ...resolved.theme?.hud },
    };
  }
  if (!resolved.include && defaults.include) resolved.include = defaults.include;
  if (!resolved.sfx && defaults.sfx) resolved.sfx = defaults.sfx;
  resolved.sfx = resolveSfxPaths(resolved.sfx, configDir);
  if (resolved.defaultDelay === undefined && defaults.defaultDelay !== undefined)
    resolved.defaultDelay = defaults.defaultDelay;
  if (resolved.clickDwell === undefined && defaults.clickDwell !== undefined)
    resolved.clickDwell = defaults.clickDwell;
  if (resolved.output && !isAbsolute(resolved.output) && outDir) {
    resolved.output = resolve(outDir, resolved.output);
  } else if (!resolved.output && outDir) {
    resolved.output = resolve(outDir, `${resolved.name}.mp4`);
  }
  return resolved;
}

async function loadTsConfig(filePath: string): Promise<unknown> {
  const jiti = createJiti(filePath, { interopDefault: true });
  const mod = await jiti.import(filePath);
  return mod;
}

function resolveViewportValue(
  raw: unknown,
): { width: number; height: number } | undefined {
  if (typeof raw === "string") return resolveViewportPreset(raw) ?? undefined;
  if (typeof raw === "object" && raw !== null)
    return raw as { width: number; height: number };
  return undefined;
}

function substituteEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (_match, braced, bare) => {
      const name = braced ?? bare;
      return process.env[name] ?? _match;
    });
  }
  if (Array.isArray(obj)) return obj.map(substituteEnvVars);
  if (typeof obj === "object" && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }
  return obj;
}

const MAX_EXTENDS_DEPTH = 10;

const MERGEABLE_TOP_LEVEL_KEYS = [
  "baseUrl",
  "viewport",
  "outDir",
  "include",
  "defaultDelay",
  "clickDwell",
] as const;

function mergeTheme(
  base: Record<string, unknown> | undefined,
  child: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !child) return undefined;
  if (!base) return child;
  if (!child) return base;
  const merged: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(base), ...Object.keys(child)]);
  for (const key of allKeys) {
    const bVal = base[key];
    const cVal = child[key];
    if (
      typeof bVal === "object" &&
      bVal !== null &&
      typeof cVal === "object" &&
      cVal !== null
    ) {
      merged[key] = { ...bVal, ...cVal };
    } else {
      merged[key] = cVal !== undefined ? cVal : bVal;
    }
  }
  return merged;
}

function mergeSfx(
  base: Record<string, unknown> | undefined,
  child: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !child) return undefined;
  if (!base) return child;
  if (!child) return base;
  return { ...base, ...child };
}

async function loadRawConfig(filePath: string): Promise<Record<string, unknown>> {
  const ext = extname(filePath);
  if (JSON_EXTENSIONS.has(ext)) {
    const raw = readFileSync(filePath, "utf-8");
    return substituteEnvVars(parseJsonc(raw)) as Record<string, unknown>;
  }
  let mod = await loadTsConfig(filePath);
  if (typeof mod === "object" && mod !== null && "default" in mod) {
    mod = (mod as Record<string, unknown>).default;
  }
  if (typeof mod !== "object" || mod === null) {
    throw new Error(`Config file must export an object: ${filePath}`);
  }
  return substituteEnvVars(mod) as Record<string, unknown>;
}

async function resolveExtends(
  parsed: Record<string, unknown>,
  filePath: string,
  seen: Set<string>,
  depth: number,
): Promise<Record<string, unknown>> {
  const extendsValue = parsed.extends;
  if (extendsValue === undefined) return parsed;

  if (extendsValue === true) {
    throw new Error(
      `"extends: true" is only valid in inline scenario configs. Use a file path instead. (in ${filePath})`,
    );
  }

  if (typeof extendsValue !== "string" || extendsValue.length === 0) {
    throw new Error(`"extends" must be a non-empty string (in ${filePath})`);
  }

  if (depth >= MAX_EXTENDS_DEPTH) {
    throw new Error(`"extends" chain too deep (max ${MAX_EXTENDS_DEPTH})`);
  }

  const baseDir = dirname(resolve(filePath));
  const basePath = resolve(baseDir, extendsValue);

  if (!existsSync(basePath)) {
    throw new Error(
      `"extends" target not found: ${extendsValue} (referenced from ${resolve(filePath)})`,
    );
  }

  const absBasePath = resolve(basePath);
  if (seen.has(absBasePath)) {
    const chain = [...seen, absBasePath].join(" -> ");
    throw new Error(`Circular "extends" detected: ${chain}`);
  }
  seen.add(absBasePath);

  let baseParsed = await loadRawConfig(absBasePath);
  baseParsed = await resolveExtends(baseParsed, absBasePath, seen, depth + 1);

  const baseIncludeDir = dirname(absBasePath);
  if (Array.isArray(baseParsed.include)) {
    baseParsed.include = baseParsed.include.map((inc: unknown) =>
      typeof inc === "string" && !isAbsolute(inc) ? resolve(baseIncludeDir, inc) : inc,
    );
  }

  const merged: Record<string, unknown> = {};

  for (const key of MERGEABLE_TOP_LEVEL_KEYS) {
    if (baseParsed[key] !== undefined) merged[key] = baseParsed[key];
  }

  merged.theme = mergeTheme(
    baseParsed.theme as Record<string, unknown> | undefined,
    parsed.theme as Record<string, unknown> | undefined,
  );
  merged.sfx = mergeSfx(
    baseParsed.sfx as Record<string, unknown> | undefined,
    parsed.sfx as Record<string, unknown> | undefined,
  );

  for (const key of MERGEABLE_TOP_LEVEL_KEYS) {
    if (parsed[key] !== undefined) merged[key] = parsed[key];
  }

  if (parsed.include !== undefined) {
    const childDir = dirname(resolve(filePath));
    merged.include = (parsed.include as unknown[]).map((inc: unknown) =>
      typeof inc === "string" && !isAbsolute(inc) ? resolve(childDir, inc) : inc,
    );
  }

  const baseVideos =
    baseParsed.videos != null &&
    typeof baseParsed.videos === "object" &&
    !Array.isArray(baseParsed.videos)
      ? { ...(baseParsed.videos as Record<string, unknown>) }
      : {};

  const childVideos =
    parsed.videos != null &&
    typeof parsed.videos === "object" &&
    !Array.isArray(parsed.videos)
      ? (parsed.videos as Record<string, unknown>)
      : {};

  const mergedVideos = { ...baseVideos, ...childVideos };

  return {
    ...merged,
    $schema: parsed.$schema,
    videos: Object.keys(mergedVideos).length > 0 ? mergedVideos : undefined,
    scenarios: parsed.scenarios,
  };
}

async function buildConfigFromParsed(
  parsed: Record<string, unknown>,
  filePath: string,
): Promise<WebreelConfig> {
  const resolved = await resolveExtends(
    parsed,
    filePath,
    new Set([resolve(filePath)]),
    0,
  );

  const hasVideos =
    resolved.videos != null &&
    typeof resolved.videos === "object" &&
    !Array.isArray(resolved.videos);
  const hasScenarios = Array.isArray(resolved.scenarios) && resolved.scenarios.length > 0;

  if (!hasVideos && !hasScenarios) {
    throw new Error(`Config must contain a "videos" object or a "scenarios" array`);
  }

  const videosObj = hasVideos
    ? (resolved.videos as Record<string, Record<string, unknown>>)
    : {};
  const configDir = dirname(resolve(filePath));
  const outDir = resolve(configDir, (resolved.outDir as string) ?? "videos");
  const defaults = {
    baseUrl: resolved.baseUrl as string | undefined,
    viewport: resolveViewportValue(resolved.viewport),
    theme: resolved.theme as WebreelConfig["theme"],
    sfx: resolved.sfx as WebreelConfig["sfx"],
    include: resolved.include as string[] | undefined,
    defaultDelay: resolved.defaultDelay as number | undefined,
    clickDwell: resolved.clickDwell as number | undefined,
  };

  const videoList: VideoConfig[] = [];
  for (const [name, body] of Object.entries(videosObj)) {
    const videoBody = { ...body };
    if (typeof videoBody.viewport === "string") {
      videoBody.viewport =
        resolveViewportPreset(videoBody.viewport as string) ?? videoBody.viewport;
    }
    const video = { ...videoBody, name, configDir } as unknown as VideoConfig;
    const resolvedVideo = resolveVideoDefaults(video, defaults, outDir, configDir);
    videoList.push(await resolveVideo(resolvedVideo, filePath));
  }

  return {
    $schema: resolved.$schema as string | undefined,
    outDir: resolved.outDir as string | undefined,
    baseUrl: resolved.baseUrl as string | undefined,
    viewport: resolveViewportValue(resolved.viewport),
    theme: resolved.theme as WebreelConfig["theme"],
    sfx: resolved.sfx as WebreelConfig["sfx"],
    include: resolved.include as string[] | undefined,
    defaultDelay: resolved.defaultDelay as number | undefined,
    clickDwell: resolved.clickDwell as number | undefined,
    videos: videoList,
  };
}

export async function loadWebreelConfig(filePath: string): Promise<WebreelConfig> {
  const ext = extname(filePath);

  if (JSON_EXTENSIONS.has(ext)) {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = substituteEnvVars(parseJsonc(raw));

    const schemaUrl =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).$schema
        : undefined;
    const version = parseSchemaVersion(
      typeof schemaUrl === "string" ? schemaUrl : undefined,
    );
    const errors = validateWebreelConfig(parsed, version);
    if (errors.length > 0) {
      const lineMap = buildLineMap(raw);
      throw new Error(formatValidationErrors(filePath, errors, lineMap));
    }

    return buildConfigFromParsed(parsed as Record<string, unknown>, filePath);
  }

  let raw = await loadTsConfig(filePath);

  if (typeof raw === "object" && raw !== null && "default" in raw) {
    raw = (raw as Record<string, unknown>).default;
  }

  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Config file must export an object: ${filePath}`);
  }

  const rawConfig = substituteEnvVars(raw) as Record<string, unknown>;
  const errors = validateWebreelConfig(rawConfig);
  if (errors.length > 0) {
    throw new Error(formatValidationErrors(filePath, errors));
  }

  return buildConfigFromParsed(rawConfig, filePath);
}

async function resolveVideo(video: VideoConfig, filePath: string): Promise<VideoConfig> {
  if (video.include && video.include.length > 0) {
    const absConfigPath = resolve(filePath);
    const seen = new Set([absConfigPath]);
    const includedSteps = await resolveIncludes(
      video as unknown as Record<string, unknown>,
      dirname(absConfigPath),
      seen,
    );
    const includeErrors: ValidationError[] = [];
    for (let i = 0; i < includedSteps.length; i++) {
      includeErrors.push(
        ...validateStep(includedSteps[i], i).map((e) => ({
          ...e,
          path: `include:${e.path}`,
        })),
      );
    }
    if (includeErrors.length > 0) {
      const msgs = includeErrors.map((e) =>
        e.path ? `${e.path}: ${e.message}` : e.message,
      );
      throw new Error(
        `Invalid included steps for video "${video.name}":\n  ${msgs.join("\n  ")}`,
      );
    }
    return {
      ...video,
      steps: [...(includedSteps as VideoConfig["steps"]), ...video.steps],
    };
  }
  return video;
}

const VALID_ACTIONS = new Set([
  "pause",
  "click",
  "key",
  "drag",
  "moveTo",
  "type",
  "scroll",
  "wait",
  "screenshot",
  "navigate",
  "hover",
  "select",
]);

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "$schema",
  "extends",
  "outDir",
  "baseUrl",
  "viewport",
  "theme",
  "sfx",
  "include",
  "defaultDelay",
  "clickDwell",
  "scenarios",
  "videos",
]);

const KNOWN_VIDEO_KEYS = new Set([
  "url",
  "baseUrl",
  "viewport",
  "zoom",
  "fps",
  "quality",
  "waitFor",
  "output",
  "thumbnail",
  "include",
  "theme",
  "sfx",
  "defaultDelay",
  "clickDwell",
  "steps",
]);

const KNOWN_STEP_KEYS: Record<string, Set<string>> = {
  pause: new Set(["action", "ms", "label", "description"]),
  click: new Set([
    "action",
    "text",
    "selector",
    "within",
    "modifiers",
    "label",
    "delay",
    "description",
  ]),
  key: new Set(["action", "key", "target", "label", "delay", "description"]),
  drag: new Set(["action", "from", "to", "label", "delay", "description"]),
  moveTo: new Set([
    "action",
    "text",
    "selector",
    "within",
    "label",
    "delay",
    "description",
  ]),
  type: new Set([
    "action",
    "text",
    "selector",
    "within",
    "charDelay",
    "label",
    "delay",
    "description",
  ]),
  scroll: new Set([
    "action",
    "x",
    "y",
    "text",
    "selector",
    "within",
    "label",
    "delay",
    "description",
  ]),
  wait: new Set([
    "action",
    "selector",
    "text",
    "within",
    "timeout",
    "label",
    "delay",
    "description",
  ]),
  screenshot: new Set(["action", "output", "label", "delay", "description"]),
  navigate: new Set(["action", "url", "label", "delay", "description"]),
  hover: new Set([
    "action",
    "text",
    "selector",
    "within",
    "label",
    "delay",
    "description",
  ]),
  select: new Set([
    "action",
    "text",
    "selector",
    "within",
    "value",
    "label",
    "delay",
    "description",
  ]),
};

export interface ValidationError {
  path: string;
  message: string;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

function suggestKey(unknown: string, known: Set<string>): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const k of known) {
    const d = levenshtein(unknown.toLowerCase(), k.toLowerCase());
    if (d < bestDist && d <= 2) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}

function checkUnknownKeys(
  obj: Record<string, unknown>,
  known: Set<string>,
  prefix: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) {
      const suggestion = suggestKey(key, known);
      const hint = suggestion ? ` (did you mean "${suggestion}"?)` : "";
      errors.push({
        path: `${prefix}.${key}`,
        message: `Unknown property${hint}`,
      });
    }
  }
  return errors;
}

function validateStep(step: unknown, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `steps[${index}]`;

  if (typeof step !== "object" || step === null) {
    errors.push({ path: prefix, message: "Step must be an object" });
    return errors;
  }

  const s = step as Record<string, unknown>;

  if (!s.action || typeof s.action !== "string") {
    errors.push({ path: `${prefix}.action`, message: "Missing or invalid action" });
    return errors;
  }

  if (!VALID_ACTIONS.has(s.action)) {
    errors.push({
      path: `${prefix}.action`,
      message: `Unknown action "${s.action}". Valid actions: ${[...VALID_ACTIONS].join(", ")}`,
    });
    return errors;
  }

  const knownKeys = KNOWN_STEP_KEYS[s.action];
  if (knownKeys) {
    errors.push(...checkUnknownKeys(s, knownKeys, prefix));
  }

  switch (s.action) {
    case "pause":
      if (!Number.isFinite(s.ms) || (s.ms as number) < 0) {
        errors.push({ path: `${prefix}.ms`, message: "Must be a non-negative number" });
      }
      break;

    case "click":
      if (!s.text && !s.selector) {
        errors.push({
          path: prefix,
          message: 'Click requires "text" or "selector"',
        });
      }
      break;

    case "key":
      if (typeof s.key !== "string" || s.key.length === 0) {
        errors.push({ path: `${prefix}.key`, message: "Must be a non-empty string" });
      }
      if (
        s.target !== undefined &&
        typeof s.target !== "string" &&
        (typeof s.target !== "object" || s.target === null)
      ) {
        errors.push({
          path: `${prefix}.target`,
          message: "Must be a CSS selector string or an element target object",
        });
      }
      break;

    case "drag": {
      if (!s.from || typeof s.from !== "object") {
        errors.push({
          path: `${prefix}.from`,
          message: "Must be an object with text or selector",
        });
      } else {
        const f = s.from as Record<string, unknown>;
        if (!f.text && !f.selector) {
          errors.push({
            path: `${prefix}.from`,
            message: 'Requires "text" or "selector"',
          });
        }
      }
      if (!s.to || typeof s.to !== "object") {
        errors.push({
          path: `${prefix}.to`,
          message: "Must be an object with text or selector",
        });
      } else {
        const t = s.to as Record<string, unknown>;
        if (!t.text && !t.selector) {
          errors.push({ path: `${prefix}.to`, message: 'Requires "text" or "selector"' });
        }
      }
      break;
    }

    case "type":
      if (typeof s.text !== "string" || s.text.length === 0) {
        errors.push({ path: `${prefix}.text`, message: "Must be a non-empty string" });
      }
      if (
        s.charDelay !== undefined &&
        (!Number.isFinite(s.charDelay) || (s.charDelay as number) < 0)
      ) {
        errors.push({
          path: `${prefix}.charDelay`,
          message: "Must be a non-negative number",
        });
      }
      break;

    case "scroll":
      if (s.x !== undefined && !Number.isFinite(s.x)) {
        errors.push({ path: `${prefix}.x`, message: "Must be a finite number" });
      }
      if (s.y !== undefined && !Number.isFinite(s.y)) {
        errors.push({ path: `${prefix}.y`, message: "Must be a finite number" });
      }
      break;

    case "wait": {
      if (!s.selector && !s.text) {
        errors.push({
          path: prefix,
          message: 'wait requires "selector" or "text"',
        });
      }
      if (
        s.timeout !== undefined &&
        (!Number.isFinite(s.timeout) || (s.timeout as number) <= 0)
      ) {
        errors.push({ path: `${prefix}.timeout`, message: "Must be a positive number" });
      }
      break;
    }

    case "moveTo":
      if (!s.text && !s.selector) {
        errors.push({
          path: prefix,
          message: 'moveTo requires "text" or "selector"',
        });
      }
      break;

    case "screenshot":
      if (typeof s.output !== "string" || s.output.length === 0) {
        errors.push({
          path: `${prefix}.output`,
          message: "Must be a non-empty string",
        });
      }
      break;

    case "navigate":
      if (typeof s.url !== "string" || s.url.length === 0) {
        errors.push({ path: `${prefix}.url`, message: "Must be a non-empty string" });
      }
      break;

    case "hover":
      if (!s.text && !s.selector) {
        errors.push({
          path: prefix,
          message: 'hover requires "text" or "selector"',
        });
      }
      break;

    case "select": {
      if (!s.selector && !s.text) {
        errors.push({
          path: prefix,
          message: 'select requires "text" or "selector"',
        });
      }
      if (typeof s.value !== "string") {
        errors.push({ path: `${prefix}.value`, message: "Must be a string" });
      }
      break;
    }
  }

  if (s.delay !== undefined && (!Number.isFinite(s.delay) || (s.delay as number) < 0)) {
    errors.push({ path: `${prefix}.delay`, message: "Must be a non-negative number" });
  }

  if (s.label !== undefined && typeof s.label !== "string") {
    errors.push({ path: `${prefix}.label`, message: "Must be a string" });
  }

  if (s.description !== undefined && typeof s.description !== "string") {
    errors.push({ path: `${prefix}.description`, message: "Must be a string" });
  }

  return errors;
}

function resolveViewportPreset(value: string): { width: number; height: number } | null {
  return VIEWPORT_PRESETS[value] ?? null;
}

function validateViewport(viewport: unknown, prefix: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof viewport === "string") {
    if (!resolveViewportPreset(viewport)) {
      const presetNames = Object.keys(VIEWPORT_PRESETS).join(", ");
      errors.push({
        path: prefix,
        message: `Unknown viewport preset "${viewport}". Valid presets: ${presetNames}`,
      });
    }
  } else if (typeof viewport !== "object" || viewport === null) {
    errors.push({
      path: prefix,
      message: "Must be a preset string or an object with width and height",
    });
  } else {
    const v = viewport as Record<string, unknown>;
    if (!Number.isFinite(v.width) || (v.width as number) <= 0) {
      errors.push({ path: `${prefix}.width`, message: "Must be a positive number" });
    }
    if (!Number.isFinite(v.height) || (v.height as number) <= 0) {
      errors.push({ path: `${prefix}.height`, message: "Must be a positive number" });
    }
  }
  return errors;
}

function validateInclude(include: unknown, prefix: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Array.isArray(include)) {
    errors.push({ path: prefix, message: "Must be an array of file paths" });
  } else {
    for (let i = 0; i < include.length; i++) {
      if (typeof include[i] !== "string" || include[i].length === 0) {
        errors.push({ path: `${prefix}[${i}]`, message: "Must be a non-empty string" });
      }
    }
  }
  return errors;
}

const VALID_SFX_VARIANTS = new Set([1, 2, 3, 4]);

function isValidSfxValue(value: unknown): boolean {
  return VALID_SFX_VARIANTS.has(value as number) || typeof value === "string";
}

function validateSfx(sfx: unknown, prefix: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof sfx !== "object" || sfx === null) {
    errors.push({ path: prefix, message: "Must be an object" });
    return errors;
  }
  const s = sfx as Record<string, unknown>;
  if (s.click !== undefined && !isValidSfxValue(s.click)) {
    errors.push({
      path: `${prefix}.click`,
      message: "Must be 1, 2, 3, 4, or a file path",
    });
  }
  if (s.key !== undefined && !isValidSfxValue(s.key)) {
    errors.push({ path: `${prefix}.key`, message: "Must be 1, 2, 3, 4, or a file path" });
  }
  return errors;
}

function validateTheme(theme: unknown, prefix: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof theme !== "object" || theme === null) {
    errors.push({ path: prefix, message: "Must be an object" });
    return errors;
  }

  const t = theme as Record<string, unknown>;

  if (t.cursor !== undefined) {
    if (typeof t.cursor !== "object" || t.cursor === null) {
      errors.push({ path: `${prefix}.cursor`, message: "Must be an object" });
    } else {
      const cur = t.cursor as Record<string, unknown>;
      if (cur.image !== undefined && typeof cur.image !== "string") {
        errors.push({
          path: `${prefix}.cursor.image`,
          message: "Must be a string (file path)",
        });
      }
      if (
        cur.size !== undefined &&
        (!Number.isFinite(cur.size) || (cur.size as number) <= 0)
      ) {
        errors.push({
          path: `${prefix}.cursor.size`,
          message: "Must be a positive number",
        });
      }
      if (
        cur.hotspot !== undefined &&
        cur.hotspot !== "top-left" &&
        cur.hotspot !== "center"
      ) {
        errors.push({
          path: `${prefix}.cursor.hotspot`,
          message: 'Must be "top-left" or "center"',
        });
      }
    }
  }

  if (t.hud !== undefined) {
    if (typeof t.hud !== "object" || t.hud === null) {
      errors.push({ path: `${prefix}.hud`, message: "Must be an object" });
    } else {
      const h = t.hud as Record<string, unknown>;
      if (h.background !== undefined && typeof h.background !== "string") {
        errors.push({ path: `${prefix}.hud.background`, message: "Must be a string" });
      }
      if (h.color !== undefined && typeof h.color !== "string") {
        errors.push({ path: `${prefix}.hud.color`, message: "Must be a string" });
      }
      if (
        h.fontSize !== undefined &&
        (!Number.isFinite(h.fontSize) || (h.fontSize as number) <= 0)
      ) {
        errors.push({
          path: `${prefix}.hud.fontSize`,
          message: "Must be a positive number",
        });
      }
      if (h.fontFamily !== undefined && typeof h.fontFamily !== "string") {
        errors.push({ path: `${prefix}.hud.fontFamily`, message: "Must be a string" });
      }
      if (
        h.borderRadius !== undefined &&
        (!Number.isFinite(h.borderRadius) || (h.borderRadius as number) < 0)
      ) {
        errors.push({
          path: `${prefix}.hud.borderRadius`,
          message: "Must be a non-negative number",
        });
      }
      if (h.position !== undefined && h.position !== "top" && h.position !== "bottom") {
        errors.push({
          path: `${prefix}.hud.position`,
          message: 'Must be "top" or "bottom"',
        });
      }
    }
  }

  return errors;
}

const KNOWN_SCENARIO_KEYS = new Set([
  "extends",
  "outDir",
  "baseUrl",
  "viewport",
  "theme",
  "sfx",
  "include",
  "defaultDelay",
  "clickDwell",
  "videos",
]);

function validateScenarios(scenarios: unknown, prefix: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Array.isArray(scenarios)) {
    errors.push({ path: prefix, message: "Must be an array" });
    return errors;
  }
  for (let i = 0; i < scenarios.length; i++) {
    const item = scenarios[i];
    const itemPath = `${prefix}[${i}]`;

    if (typeof item === "string") {
      if (item.length === 0) {
        errors.push({ path: itemPath, message: "Must be a non-empty string" });
      }
      continue;
    }

    if (typeof item !== "object" || item === null) {
      errors.push({
        path: itemPath,
        message: "Must be a glob string or an inline scenario object",
      });
      continue;
    }

    const s = item as Record<string, unknown>;

    errors.push(...checkUnknownKeys(s, KNOWN_SCENARIO_KEYS, itemPath));

    if (s.extends !== undefined) {
      if (
        typeof s.extends !== "boolean" &&
        (typeof s.extends !== "string" || s.extends.length === 0)
      ) {
        errors.push({
          path: `${itemPath}.extends`,
          message: "Must be true, false, or a non-empty string",
        });
      }
    }

    if (
      s.videos === undefined ||
      s.videos === null ||
      typeof s.videos !== "object" ||
      Array.isArray(s.videos)
    ) {
      errors.push({
        path: `${itemPath}.videos`,
        message: "Required, must be an object mapping names to video configs",
      });
      continue;
    }

    const scenarioVideos = s.videos as Record<string, unknown>;
    for (const [name, video] of Object.entries(scenarioVideos)) {
      const vPrefix = `${itemPath}.videos.${name}`;
      if (typeof video !== "object" || video === null) {
        errors.push({ path: vPrefix, message: "Must be a video config object" });
        continue;
      }
      const d = video as Record<string, unknown>;
      errors.push(...checkUnknownKeys(d, KNOWN_VIDEO_KEYS, vPrefix));
      if (typeof d.url !== "string" || d.url.length === 0) {
        errors.push({
          path: `${vPrefix}.url`,
          message: "Required, must be a non-empty string",
        });
      }
      if (!Array.isArray(d.steps)) {
        errors.push({ path: `${vPrefix}.steps`, message: "Required, must be an array" });
      } else {
        for (let j = 0; j < d.steps.length; j++) {
          errors.push(
            ...validateStep(d.steps[j], j).map((e) => ({
              ...e,
              path: `${vPrefix}.${e.path}`,
            })),
          );
        }
      }
    }

    if (s.viewport !== undefined) {
      errors.push(...validateViewport(s.viewport, `${itemPath}.viewport`));
    }
    if (s.theme !== undefined) {
      errors.push(...validateTheme(s.theme, `${itemPath}.theme`));
    }
    if (s.sfx !== undefined) {
      errors.push(...validateSfx(s.sfx, `${itemPath}.sfx`));
    }
    if (s.include !== undefined) {
      errors.push(...validateInclude(s.include, `${itemPath}.include`));
    }
  }
  return errors;
}

export function validateWebreelConfig(
  config: unknown,
  version: number = CURRENT_SCHEMA_VERSION,
): ValidationError[] {
  if (version !== 1) {
    return [
      {
        path: "$schema",
        message: `Unsupported schema version: v${version}. This version of webreel supports v1.`,
      },
    ];
  }

  const errors: ValidationError[] = [];

  if (typeof config !== "object" || config === null) {
    errors.push({ path: "", message: "Config must be an object" });
    return errors;
  }

  const c = config as Record<string, unknown>;

  errors.push(...checkUnknownKeys(c, KNOWN_TOP_LEVEL_KEYS, ""));

  if (c.extends !== undefined) {
    if (typeof c.extends === "boolean") {
      if (c.extends !== true) {
        errors.push({ path: "extends", message: "Must be true or a non-empty string" });
      }
    } else if (typeof c.extends !== "string" || c.extends.length === 0) {
      errors.push({ path: "extends", message: "Must be true or a non-empty string" });
    }
  }

  if (c.scenarios !== undefined) {
    errors.push(...validateScenarios(c.scenarios, "scenarios"));
  }

  if (c.outDir !== undefined && (typeof c.outDir !== "string" || c.outDir.length === 0)) {
    errors.push({ path: "outDir", message: "Must be a non-empty string" });
  }

  if (c.baseUrl !== undefined && typeof c.baseUrl !== "string") {
    errors.push({ path: "baseUrl", message: "Must be a string" });
  }

  if (c.viewport !== undefined) {
    errors.push(...validateViewport(c.viewport, "viewport"));
  }

  if (
    c.defaultDelay !== undefined &&
    (!Number.isFinite(c.defaultDelay) || (c.defaultDelay as number) < 0)
  ) {
    errors.push({ path: "defaultDelay", message: "Must be a non-negative number" });
  }

  if (
    c.clickDwell !== undefined &&
    (!Number.isFinite(c.clickDwell) || (c.clickDwell as number) < 0)
  ) {
    errors.push({ path: "clickDwell", message: "Must be a non-negative number" });
  }

  if (c.include !== undefined) {
    errors.push(...validateInclude(c.include, "include"));
  }

  if (c.theme !== undefined) {
    errors.push(...validateTheme(c.theme, "theme"));
  }

  if (c.sfx !== undefined) {
    errors.push(...validateSfx(c.sfx, "sfx"));
  }

  const hasScenarios = Array.isArray(c.scenarios) && c.scenarios.length > 0;

  if (c.videos === undefined || c.videos === null) {
    if (!hasScenarios) {
      errors.push({
        path: "videos",
        message: "Required, must be an object mapping names to video configs",
      });
    }
    return errors;
  }

  if (typeof c.videos !== "object" || Array.isArray(c.videos)) {
    errors.push({
      path: "videos",
      message: "Must be an object mapping names to video configs",
    });
    return errors;
  }

  const videos = c.videos as Record<string, unknown>;
  const names = Object.keys(videos);

  if (names.length === 0 && !hasScenarios) {
    errors.push({ path: "videos", message: "Must contain at least one video" });
  }

  for (const name of names) {
    const video = videos[name];
    const prefix = `videos.${name}`;

    if (typeof video !== "object" || video === null) {
      errors.push({ path: prefix, message: "Must be a video config object" });
      continue;
    }

    const d = video as Record<string, unknown>;

    errors.push(...checkUnknownKeys(d, KNOWN_VIDEO_KEYS, prefix));

    if (typeof d.url !== "string" || d.url.length === 0) {
      errors.push({
        path: `${prefix}.url`,
        message: "Required, must be a non-empty string",
      });
    }

    if (d.zoom !== undefined && (!Number.isFinite(d.zoom) || (d.zoom as number) <= 0)) {
      errors.push({ path: `${prefix}.zoom`, message: "Must be a positive number" });
    }

    if (
      d.fps !== undefined &&
      (!Number.isFinite(d.fps) || (d.fps as number) < 1 || (d.fps as number) > 120)
    ) {
      errors.push({
        path: `${prefix}.fps`,
        message: "Must be a number between 1 and 120",
      });
    }

    if (
      d.quality !== undefined &&
      (!Number.isFinite(d.quality) ||
        (d.quality as number) < 1 ||
        (d.quality as number) > 100)
    ) {
      errors.push({
        path: `${prefix}.quality`,
        message: "Must be a number between 1 and 100",
      });
    }

    if (d.viewport !== undefined) {
      errors.push(...validateViewport(d.viewport, `${prefix}.viewport`));
    }

    if (d.include !== undefined) {
      errors.push(...validateInclude(d.include, `${prefix}.include`));
    }

    if (
      d.output !== undefined &&
      (typeof d.output !== "string" || d.output.length === 0)
    ) {
      errors.push({ path: `${prefix}.output`, message: "Must be a non-empty string" });
    }

    if (d.waitFor !== undefined) {
      if (typeof d.waitFor === "string") {
        if (d.waitFor.length === 0) {
          errors.push({
            path: `${prefix}.waitFor`,
            message: "Must be a non-empty string",
          });
        }
      } else if (typeof d.waitFor === "object" && d.waitFor !== null) {
        const wf = d.waitFor as Record<string, unknown>;
        if (!wf.selector && !wf.text) {
          errors.push({
            path: `${prefix}.waitFor`,
            message: 'Must have "selector" or "text"',
          });
        }
      } else {
        errors.push({
          path: `${prefix}.waitFor`,
          message: "Must be a CSS selector string or an object with selector/text",
        });
      }
    }

    if (
      d.defaultDelay !== undefined &&
      (!Number.isFinite(d.defaultDelay) || (d.defaultDelay as number) < 0)
    ) {
      errors.push({
        path: `${prefix}.defaultDelay`,
        message: "Must be a non-negative number",
      });
    }

    if (
      d.clickDwell !== undefined &&
      (!Number.isFinite(d.clickDwell) || (d.clickDwell as number) < 0)
    ) {
      errors.push({
        path: `${prefix}.clickDwell`,
        message: "Must be a non-negative number",
      });
    }

    if (d.thumbnail !== undefined) {
      if (typeof d.thumbnail !== "object" || d.thumbnail === null) {
        errors.push({ path: `${prefix}.thumbnail`, message: "Must be an object" });
      } else {
        const th = d.thumbnail as Record<string, unknown>;
        if (
          th.time !== undefined &&
          (!Number.isFinite(th.time) || (th.time as number) < 0)
        ) {
          errors.push({
            path: `${prefix}.thumbnail.time`,
            message: "Must be a non-negative number (seconds)",
          });
        }
        if (th.enabled !== undefined && typeof th.enabled !== "boolean") {
          errors.push({
            path: `${prefix}.thumbnail.enabled`,
            message: "Must be a boolean",
          });
        }
      }
    }

    if (d.theme !== undefined) {
      errors.push(...validateTheme(d.theme, `${prefix}.theme`));
    }

    if (d.sfx !== undefined) {
      errors.push(...validateSfx(d.sfx, `${prefix}.sfx`));
    }

    if (!Array.isArray(d.steps)) {
      errors.push({ path: `${prefix}.steps`, message: "Required, must be an array" });
    } else {
      for (let j = 0; j < d.steps.length; j++) {
        errors.push(
          ...validateStep(d.steps[j], j).map((e) => ({
            ...e,
            path: `${prefix}.${e.path}`,
          })),
        );
      }
    }
  }

  return errors;
}

export function buildLineMap(raw: string): Map<string, number> {
  const lineMap = new Map<string, number>();
  const tree = parseTree(raw);
  if (!tree) return lineMap;

  function walk(node: ReturnType<typeof parseTree>): void {
    if (!node) return;
    const path = getNodePath(node);
    const jsonPath = path
      .map((seg) => (typeof seg === "number" ? `[${seg}]` : seg))
      .join(".")
      .replace(/\.\[/g, "[");

    const line = raw.substring(0, node.offset).split("\n").length;
    if (jsonPath) lineMap.set(jsonPath, line);

    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  if (tree.children) {
    for (const child of tree.children) {
      walk(child);
    }
  }

  return lineMap;
}

function findLineForPath(
  lineMap: Map<string, number>,
  errorPath: string,
): number | undefined {
  if (lineMap.has(errorPath)) return lineMap.get(errorPath);
  const parts = errorPath.split(".");
  while (parts.length > 0) {
    parts.pop();
    const parent = parts.join(".");
    if (lineMap.has(parent)) return lineMap.get(parent);
  }
  return undefined;
}

export function formatValidationErrors(
  filePath: string,
  errors: ValidationError[],
  lineMap?: Map<string, number>,
): string {
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

  const maxPath = Math.max(...errors.map((e) => e.path.length));
  const lines = errors.map((e) => {
    const paddedPath = e.path.padEnd(maxPath);
    const lineNum = lineMap ? findLineForPath(lineMap, e.path) : undefined;
    const linePrefix = lineNum !== undefined ? yellow(`L${lineNum} `) : "";
    return `  ${linePrefix}${red(paddedPath)}  ${dim(e.message)}`;
  });

  return `${bold(red("Error:"))} Invalid config ${bold(filePath)}\n\n${lines.join("\n")}`;
}

export function getConfigDir(configPath: string): string {
  return dirname(resolve(configPath));
}

export function filterVideosByName(
  videos: VideoConfig[],
  names: string[],
): VideoConfig[] {
  if (names.length === 0) return videos;
  const filtered = videos.filter((v) => names.includes(v.name));
  const found = new Set(filtered.map((v) => v.name));
  const missing = names.filter((n) => !found.has(n));
  if (missing.length > 0) {
    const available = videos.map((v) => v.name).join(", ");
    throw new Error(`Video(s) not found: ${missing.join(", ")}. Available: ${available}`);
  }
  return filtered;
}

export function filterVideosByProject(
  videos: VideoConfig[],
  patterns: string[],
): VideoConfig[] {
  if (patterns.length === 0) return videos;

  const result = new Set<string>();
  const exactMissing: string[] = [];

  for (const pattern of patterns) {
    if (isDynamicPattern(pattern)) {
      const matcher = picomatch(pattern);
      for (const v of videos) {
        if (matcher(v.name)) result.add(v.name);
      }
    } else {
      const found = videos.find((v) => v.name === pattern);
      if (found) {
        result.add(found.name);
      } else {
        exactMissing.push(pattern);
      }
    }
  }

  if (exactMissing.length > 0) {
    const available = videos.map((v) => v.name).join(", ");
    throw new Error(
      `Project(s) not found: ${exactMissing.join(", ")}. Available: ${available}`,
    );
  }

  if (result.size === 0) {
    throw new Error(`No videos matched --project patterns: ${patterns.join(", ")}`);
  }

  return videos.filter((v) => result.has(v.name));
}

export function filterVideos(
  videos: VideoConfig[],
  names: string[],
  projects: string[],
): VideoConfig[] {
  if (names.length === 0 && projects.length === 0) return videos;
  if (names.length > 0 && projects.length === 0) return filterVideosByName(videos, names);
  if (names.length === 0 && projects.length > 0)
    return filterVideosByProject(videos, projects);

  const byName = new Set(filterVideosByName(videos, names).map((v) => v.name));
  const byProject = new Set(filterVideosByProject(videos, projects).map((v) => v.name));
  const union = new Set([...byName, ...byProject]);

  if (union.size === 0) {
    throw new Error("No videos matched the given filters.");
  }

  return videos.filter((v) => union.has(v.name));
}

export function resolveConfigPath(configPath?: string): string {
  if (configPath) {
    const resolved = resolve(configPath);
    if (!existsSync(resolved)) {
      throw new Error(`Config file not found: ${resolved}`);
    }
    return resolved;
  }

  let dir = process.cwd();
  const root = resolve("/");

  while (true) {
    for (const ext of CONFIG_EXTENSIONS) {
      const candidate = resolve(dir, `${DEFAULT_CONFIG_NAME}${ext}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }

  throw new Error(
    `No config file found. Create a ${DEFAULT_CONFIG_FILE} or specify one with --config.`,
  );
}

export async function resolveConfigPaths(configOpt?: string[]): Promise<string[]> {
  if (!configOpt || configOpt.length === 0) {
    return [resolveConfigPath()];
  }

  const resolved = new Set<string>();

  for (const pattern of configOpt) {
    if (isDynamicPattern(pattern)) {
      const matches = await glob([pattern], {
        cwd: process.cwd(),
        absolute: true,
      });
      if (matches.length === 0) {
        throw new Error(`No config files matched: "${pattern}"`);
      }
      for (const m of matches) resolved.add(resolve(m));
    } else {
      const abs = resolve(pattern);
      if (!existsSync(abs)) {
        throw new Error(`Config file not found: ${abs}`);
      }
      resolved.add(abs);
    }
  }

  if (resolved.size === 0) {
    throw new Error("No config files found.");
  }

  return [...resolved];
}

async function resolveScenarios(
  rootParsed: Record<string, unknown>,
  configPath: string,
): Promise<{ videos: VideoConfig[]; sources: Map<string, string> }> {
  const scenarios = rootParsed.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return { videos: [], sources: new Map() };
  }

  const configDir = dirname(resolve(configPath));
  const relConfigPath = relative(process.cwd(), resolve(configPath));
  const allVideos: VideoConfig[] = [];
  const sources = new Map<string, string>();
  const loadedPaths = new Set<string>();
  const errors: string[] = [];
  let scenarioIndex = 0;

  for (const item of scenarios) {
    if (typeof item === "string") {
      const matches = await glob([item], {
        cwd: configDir,
        absolute: true,
      });
      for (const matchPath of matches) {
        const abs = resolve(matchPath);
        if (loadedPaths.has(abs)) continue;
        loadedPaths.add(abs);

        try {
          const childConfig = await loadWebreelConfig(abs);

          const childRaw = await loadRawConfig(abs);
          if (Array.isArray(childRaw.scenarios) && childRaw.scenarios.length > 0) {
            console.warn(
              `Warning: "scenarios" in ${relative(process.cwd(), abs)} ignored (nested scenarios not supported)`,
            );
          }

          const relChild = relative(process.cwd(), abs);
          for (const video of childConfig.videos) {
            sources.set(video.name, relChild);
            allVideos.push(video);
          }
        } catch (err) {
          errors.push(
            `${relative(process.cwd(), abs)}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      continue;
    }

    if (typeof item === "object" && item !== null) {
      scenarioIndex++;
      const scenario = item as Record<string, unknown>;
      const sourceLabel = `${relConfigPath} [scenario #${scenarioIndex}]`;

      let scenarioParsed: Record<string, unknown>;

      if (scenario.extends === true) {
        scenarioParsed = { ...scenario };
        delete scenarioParsed.extends;

        for (const key of MERGEABLE_TOP_LEVEL_KEYS) {
          if (scenarioParsed[key] === undefined && rootParsed[key] !== undefined) {
            scenarioParsed[key] = rootParsed[key];
          }
        }
        if (scenarioParsed.theme === undefined && rootParsed.theme !== undefined) {
          scenarioParsed.theme = rootParsed.theme;
        } else if (rootParsed.theme !== undefined) {
          scenarioParsed.theme = mergeTheme(
            rootParsed.theme as Record<string, unknown> | undefined,
            scenarioParsed.theme as Record<string, unknown> | undefined,
          );
        }
        if (scenarioParsed.sfx === undefined && rootParsed.sfx !== undefined) {
          scenarioParsed.sfx = rootParsed.sfx;
        } else if (rootParsed.sfx !== undefined) {
          scenarioParsed.sfx = mergeSfx(
            rootParsed.sfx as Record<string, unknown> | undefined,
            scenarioParsed.sfx as Record<string, unknown> | undefined,
          );
        }
      } else if (typeof scenario.extends === "string") {
        scenarioParsed = await resolveExtends(
          scenario,
          configPath,
          new Set([resolve(configPath)]),
          0,
        );
      } else {
        scenarioParsed = scenario;
      }

      if (
        scenarioParsed.videos != null &&
        typeof scenarioParsed.videos === "object" &&
        !Array.isArray(scenarioParsed.videos)
      ) {
        const scenarioDir = configDir;
        const outDir = resolve(
          scenarioDir,
          (scenarioParsed.outDir as string) ?? "videos",
        );
        const defaults = {
          baseUrl: scenarioParsed.baseUrl as string | undefined,
          viewport: resolveViewportValue(scenarioParsed.viewport),
          theme: scenarioParsed.theme as WebreelConfig["theme"],
          sfx: scenarioParsed.sfx as WebreelConfig["sfx"],
          include: scenarioParsed.include as string[] | undefined,
          defaultDelay: scenarioParsed.defaultDelay as number | undefined,
          clickDwell: scenarioParsed.clickDwell as number | undefined,
        };

        const videosObj = scenarioParsed.videos as Record<
          string,
          Record<string, unknown>
        >;
        for (const [name, body] of Object.entries(videosObj)) {
          const videoBody = { ...body };
          if (typeof videoBody.viewport === "string") {
            videoBody.viewport =
              resolveViewportPreset(videoBody.viewport as string) ?? videoBody.viewport;
          }
          const video = {
            ...videoBody,
            name,
            configDir: scenarioDir,
          } as unknown as VideoConfig;
          const resolvedVideo = resolveVideoDefaults(
            video,
            defaults,
            outDir,
            scenarioDir,
          );
          const finalVideo = await resolveVideo(resolvedVideo, configPath);
          sources.set(name, sourceLabel);
          allVideos.push(finalVideo);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to load scenario configs:\n  ${errors.join("\n  ")}`);
  }

  return { videos: allVideos, sources };
}

export async function loadFullConfig(paths: string[]): Promise<FullConfig> {
  const allVideos: VideoConfig[] = [];
  const videoSources = new Map<string, string>();

  for (const configPath of paths) {
    const config = await loadWebreelConfig(configPath);
    const relPath = relative(process.cwd(), resolve(configPath));

    for (const video of config.videos) {
      if (videoSources.has(video.name)) {
        throw new Error(
          `Duplicate video name "${video.name}" in ${videoSources.get(video.name)} and ${relPath}`,
        );
      }
      videoSources.set(video.name, relPath);
      allVideos.push(video);
    }

    const raw = await loadRawConfig(configPath);
    if (Array.isArray(raw.scenarios) && raw.scenarios.length > 0) {
      const { videos: scenarioVideos, sources } = await resolveScenarios(raw, configPath);
      for (const video of scenarioVideos) {
        const source = sources.get(video.name) ?? relPath;
        if (videoSources.has(video.name)) {
          throw new Error(
            `Duplicate video name "${video.name}" in ${videoSources.get(video.name)} and ${source}`,
          );
        }
        videoSources.set(video.name, source);
        allVideos.push(video);
      }
    }
  }

  return { videos: allVideos, videoSources };
}
