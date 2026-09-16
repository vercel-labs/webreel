import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KNOWN_TOP_LEVEL_KEYS, KNOWN_VIDEO_KEYS, KNOWN_STEP_KEYS } from "../config.js";

// The published schema sets additionalProperties: false, so any option the
// validator accepts but the schema omits is reported as an error by editors.
const schema = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../../../../apps/docs/public/schema/v1.json"),
    "utf-8",
  ),
) as {
  properties: Record<string, unknown>;
  $defs: Record<string, { properties?: Record<string, unknown> }>;
};

describe("published JSON schema", () => {
  it("documents every top-level option the validator accepts", () => {
    const missing = [...KNOWN_TOP_LEVEL_KEYS].filter(
      (key) => !(key in schema.properties),
    );
    expect(missing).toEqual([]);
  });

  it("documents every per-video option the validator accepts", () => {
    const props = schema.$defs.video.properties ?? {};
    const missing = [...KNOWN_VIDEO_KEYS].filter((key) => !(key in props));
    expect(missing).toEqual([]);
  });

  it("documents every step field the validator accepts", () => {
    const missing: string[] = [];
    for (const [action, keys] of Object.entries(KNOWN_STEP_KEYS)) {
      const def = schema.$defs[`step${action[0].toUpperCase()}${action.slice(1)}`];
      expect(
        def,
        `schema is missing a definition for the "${action}" step`,
      ).toBeDefined();
      const props = def.properties ?? {};
      for (const key of keys) if (!(key in props)) missing.push(`${action}.${key}`);
    }
    expect(missing).toEqual([]);
  });
});
