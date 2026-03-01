import { Command } from "commander";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import {
  resolveConfigPath,
  validateWebreelConfig,
  parseSchemaVersion,
  formatValidationErrors,
  buildLineMap,
  loadWebreelConfig,
} from "../lib/config.js";

const JSON_EXTENSIONS = new Set([".json"]);

export const validateCommand = new Command("validate")
  .description("Validate a webreel config file")
  .option("-c, --config <path>", "Path to config file (default: webreel.config.json)")
  .action(async (opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config);
    const name = basename(configPath);
    const ext = extname(configPath);

    if (JSON_EXTENSIONS.has(ext)) {
      const raw = readFileSync(configPath, "utf-8");
      let parsed: unknown;
      try {
        parsed = parseJsonc(raw);
      } catch (err) {
        throw new Error(
          `${name}: invalid JSON - ${err instanceof Error ? err.message : String(err)}`,
          {
            cause: err,
          },
        );
      }

      const schemaUrl =
        typeof parsed === "object" && parsed !== null
          ? (parsed as Record<string, unknown>).$schema
          : undefined;
      const version = parseSchemaVersion(
        typeof schemaUrl === "string" ? schemaUrl : undefined,
      );
      const errors = validateWebreelConfig(parsed, version);

      if (errors.length === 0) {
        console.log(`${name}: valid`);
      } else {
        const lineMap = buildLineMap(raw);
        throw new Error(formatValidationErrors(name, errors, lineMap));
      }
    } else {
      await loadWebreelConfig(configPath);
      console.log(`${name}: valid`);
    }
  });
