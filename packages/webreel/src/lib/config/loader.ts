import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, isAbsolute, extname } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import type { VideoConfig, WebreelConfig } from "../types.js";
import { resolveIncludes, loadTsConfig } from "./includes.js";
import {
  validateStep,
  validateWebreelConfig,
  resolveViewportPreset,
  parseSchemaVersion,
} from "./validate.js";
import type { ValidationError } from "./errors.js";
import { buildLineMap, formatValidationErrors } from "./errors.js";

export const DEFAULT_CONFIG_NAME = "webreel.config";
export const DEFAULT_CONFIG_FILE = "webreel.config.json";

const CONFIG_EXTENSIONS = [".json", ".ts", ".mts", ".js", ".mjs"];
const JSON_EXTENSIONS = new Set([".json"]);

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

async function buildConfigFromParsed(
  parsed: Record<string, unknown>,
  filePath: string,
): Promise<WebreelConfig> {
  if (
    !parsed.videos ||
    typeof parsed.videos !== "object" ||
    Array.isArray(parsed.videos)
  ) {
    throw new Error(`Config must contain a "videos" object`);
  }
  const videosObj = parsed.videos as Record<string, Record<string, unknown>>;
  const configDir = dirname(resolve(filePath));
  const outDir = resolve(configDir, (parsed.outDir as string) ?? "videos");
  const defaults = {
    baseUrl: parsed.baseUrl as string | undefined,
    viewport: resolveViewportValue(parsed.viewport),
    theme: parsed.theme as WebreelConfig["theme"],
    sfx: parsed.sfx as WebreelConfig["sfx"],
    include: parsed.include as string[] | undefined,
    defaultDelay: parsed.defaultDelay as number | undefined,
    clickDwell: parsed.clickDwell as number | undefined,
  };

  const videoList: VideoConfig[] = [];
  for (const [name, body] of Object.entries(videosObj)) {
    const videoBody = { ...body };
    if (typeof videoBody.viewport === "string") {
      videoBody.viewport =
        resolveViewportPreset(videoBody.viewport as string) ?? videoBody.viewport;
    }
    const video = { ...videoBody, name } as unknown as VideoConfig;
    const resolved = resolveVideoDefaults(video, defaults, outDir, configDir);
    videoList.push(await resolveVideo(resolved, filePath));
  }

  return {
    $schema: parsed.$schema as string | undefined,
    outDir: parsed.outDir as string | undefined,
    baseUrl: parsed.baseUrl as string | undefined,
    viewport: resolveViewportValue(parsed.viewport),
    theme: parsed.theme as WebreelConfig["theme"],
    sfx: parsed.sfx as WebreelConfig["sfx"],
    include: parsed.include as string[] | undefined,
    defaultDelay: parsed.defaultDelay as number | undefined,
    clickDwell: parsed.clickDwell as number | undefined,
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

  const raw = await loadTsConfig(filePath);

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
