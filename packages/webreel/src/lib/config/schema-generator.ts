/**
 * Pure JSON Schema generation logic, kept separate from `schema-def.ts` (the
 * data) so it can be unit tested from within `src/` (see
 * `__tests__/schema-generate.test.ts`). The CLI entry point that writes
 * `apps/docs/public/schema/v1.json` lives in `scripts/generate-schema.ts` and
 * just calls `generateSchema()` below.
 */

import {
  type FieldSchema,
  TOP_LEVEL_FIELDS,
  TOP_LEVEL_REQUIRED,
  VIDEO_DEF,
  STEP_DEFS,
  VIEWPORT_DEF,
  CURSOR_CONFIG_DEF,
  THEME_DEF,
  SFX_DEF,
  THUMBNAIL_DEF,
  AUTOZOOM_DEF,
  DELAY_DEF,
  LABEL_DEF,
  DESCRIPTION_DEF,
  ELEMENT_TARGET_DEF,
} from "./schema-def.js";

export type JsonRecord = Record<string, unknown>;

function genNode(field: FieldSchema): JsonRecord {
  const out: JsonRecord = {};
  if (field.ref) out.$ref = `#/$defs/${field.ref}`;
  if (field.oneOf) out.oneOf = field.oneOf.map(genNode);
  if (field.type) out.type = field.type;
  if (field.const !== undefined) out.const = field.const;
  if (field.enum) out.enum = field.enum;
  if (field.minimum !== undefined) out.minimum = field.minimum;
  if (field.maximum !== undefined) out.maximum = field.maximum;
  if (field.minLength !== undefined) out.minLength = field.minLength;
  if (field.minProperties !== undefined) out.minProperties = field.minProperties;
  if (field.items) out.items = genNode(field.items);
  if (field.properties) out.properties = genProperties(field.properties);
  if (field.required) out.required = field.required;
  if (field.additionalPropertiesRef) {
    out.additionalProperties = { $ref: `#/$defs/${field.additionalPropertiesRef}` };
  } else if (field.additionalProperties !== undefined) {
    out.additionalProperties = field.additionalProperties;
  }
  if (field.default !== undefined) out.default = field.default;
  if (field.description !== undefined) out.description = field.description;
  return out;
}

function genProperties(properties: Record<string, FieldSchema>): JsonRecord {
  const out: JsonRecord = {};
  for (const [key, field] of Object.entries(properties)) {
    out[key] = genNode(field);
  }
  return out;
}

function genStepDef(stepDef: (typeof STEP_DEFS)[string]): JsonRecord {
  const out: JsonRecord = {
    type: "object",
    required: stepDef.required,
    properties: genProperties(stepDef.properties),
  };
  if (stepDef.requiredOneOf) {
    out.oneOf = stepDef.requiredOneOf.map((fields) => ({ required: fields }));
  }
  out.additionalProperties = false;
  return out;
}

export function generateSchema(): JsonRecord {
  const defs: JsonRecord = {
    viewport: genNode(VIEWPORT_DEF),
    cursorConfig: genNode(CURSOR_CONFIG_DEF),
    theme: genNode(THEME_DEF),
    sfx: genNode(SFX_DEF),
    thumbnail: genNode(THUMBNAIL_DEF),
    autoZoom: genNode(AUTOZOOM_DEF),
    video: genNode(VIDEO_DEF),
    step: {
      oneOf: Object.values(STEP_DEFS).map((def) => ({ $ref: `#/$defs/${def.defName}` })),
    },
    delay: genNode(DELAY_DEF),
    label: genNode(LABEL_DEF),
    description: genNode(DESCRIPTION_DEF),
  };

  for (const def of Object.values(STEP_DEFS)) {
    defs[def.defName] = genStepDef(def);
  }

  defs.elementTarget = genNode(ELEMENT_TARGET_DEF);

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://webreel.dev/schema/v1.json",
    title: "webreel Configuration",
    description:
      "Configuration file for webreel - record scripted browser videos as MP4/GIF/WebM. String values support environment variable substitution via $VAR or ${VAR} syntax. Set CHROME_PATH or FFMPEG_PATH to override auto-downloaded binaries.",
    type: "object",
    required: TOP_LEVEL_REQUIRED,
    properties: genProperties(TOP_LEVEL_FIELDS),
    additionalProperties: false,
    $defs: defs,
  };
}
