import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { validateWebreelConfig } from "../config.js";

const examplesDir = resolve(__dirname, "../../../../../examples");

const exampleDirs = readdirSync(examplesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((name) => existsSync(resolve(examplesDir, name, "webreel.config.json")));

describe("example configs", () => {
  it.each(exampleDirs)("%s has a valid config", (name) => {
    const configPath = resolve(examplesDir, name, "webreel.config.json");
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const errors = validateWebreelConfig(parsed);
    expect(errors).toEqual([]);
  });
});
