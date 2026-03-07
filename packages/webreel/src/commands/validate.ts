import { Command } from "commander";
import { readFileSync } from "node:fs";
import { basename, extname, relative } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import {
  resolveConfigPaths,
  validateWebreelConfig,
  parseSchemaVersion,
  formatValidationErrors,
  buildLineMap,
  loadFullConfig,
  loadWebreelConfig,
} from "../lib/config.js";

const JSON_EXTENSIONS = new Set([".json"]);

function accumulate(val: string, prev: string[]): string[] {
  return [...prev, val];
}

export const validateCommand = new Command("validate")
  .description("Validate webreel config file(s)")
  .option("-c, --config <path>", "Config file (repeatable)", accumulate, [])
  .action(async (opts: { config: string[] }) => {
    const configPaths = await resolveConfigPaths(
      opts.config.length > 0 ? opts.config : undefined,
    );

    const errors: string[] = [];

    for (const configPath of configPaths) {
      const name = basename(configPath);
      const ext = extname(configPath);

      try {
        if (JSON_EXTENSIONS.has(ext)) {
          const raw = readFileSync(configPath, "utf-8");
          let parsed: unknown;
          try {
            parsed = parseJsonc(raw);
          } catch (err) {
            errors.push(
              `${name}: invalid JSON - ${err instanceof Error ? err.message : String(err)}`,
            );
            continue;
          }

          const schemaUrl =
            typeof parsed === "object" && parsed !== null
              ? (parsed as Record<string, unknown>).$schema
              : undefined;
          const version = parseSchemaVersion(
            typeof schemaUrl === "string" ? schemaUrl : undefined,
          );
          const validationErrors = validateWebreelConfig(parsed, version);

          if (validationErrors.length > 0) {
            const lineMap = buildLineMap(raw);
            errors.push(formatValidationErrors(name, validationErrors, lineMap));
          } else {
            console.log(`${name}: valid`);
          }
        } else {
          await loadWebreelConfig(configPath);
          console.log(`${name}: valid`);
        }
      } catch (err) {
        errors.push(
          `${relative(process.cwd(), configPath)}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (configPaths.length > 1) {
      try {
        const full = await loadFullConfig(configPaths);
        console.log(`Cross-config: ${full.videos.length} video(s), no duplicates`);
      } catch (err) {
        errors.push(`Cross-config: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n\n"));
    }
  });
