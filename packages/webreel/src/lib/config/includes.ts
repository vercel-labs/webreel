import { readFileSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { createJiti } from "jiti";

const JSON_EXTENSIONS = new Set([".json"]);

export async function loadTsConfig(filePath: string): Promise<unknown> {
  const jiti = createJiti(filePath, { interopDefault: true });
  const mod = await jiti.import(filePath);
  return mod;
}

export async function resolveIncludes(
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
        const mod = await loadTsConfig(absPath);
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
