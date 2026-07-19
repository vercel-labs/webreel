import { describe, it, expect } from "vitest";
import { generateSchema } from "../config/schema-generator.js";
import { STEP_DEFS } from "../config/schema-def.js";

describe("generateSchema", () => {
  it("produces output that parses as JSON (round-trips through JSON.stringify/parse)", () => {
    const schema = generateSchema();
    const roundTripped = JSON.parse(JSON.stringify(schema));
    expect(roundTripped).toEqual(schema);
  });

  it("declares the same step-type action list as the registry", () => {
    const schema = generateSchema() as {
      $defs: Record<string, { oneOf?: { $ref: string }[] }>;
    };
    const stepUnion = schema.$defs.step.oneOf;
    expect(stepUnion).toBeDefined();

    const schemaDefNames = stepUnion!.map((branch) =>
      branch.$ref.replace("#/$defs/", ""),
    );
    const registryDefNames = Object.values(STEP_DEFS).map((def) => def.defName);

    expect(schemaDefNames.sort()).toEqual(registryDefNames.slice().sort());
    expect(schemaDefNames.length).toBe(Object.keys(STEP_DEFS).length);

    // Every action's def name must also actually exist as a $defs entry.
    for (const defName of schemaDefNames) {
      expect(schema.$defs).toHaveProperty(defName);
    }
  });

  it("is idempotent: running twice produces identical output", () => {
    const first = generateSchema();
    const second = generateSchema();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
