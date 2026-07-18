/**
 * Single source of truth for the webreel config surface.
 *
 * This registry describes every top-level key, video key, step type, and
 * shared sub-object (viewport, theme, sfx, autoZoom, ...) as a small
 * JSON-Schema-shaped data structure. Two consumers read it:
 *
 *  - `validate.ts` derives its known-key allowlists (and therefore its
 *    "unknown property (did you mean ...)" suggestions) from
 *    `Object.keys(...)` over the relevant registry entries.
 *  - `scripts/generate-schema.ts` walks the same registry to emit
 *    `apps/docs/public/schema/v1.json`.
 *
 * Hand-written semantic rules (numeric ranges, "requires text or selector",
 * cross-field defaults, ...) are NOT expressed here; they remain as code in
 * `validate.ts`, keyed off the field names declared in this file. This
 * registry only needs to describe SHAPE (which keys exist, their JSON types,
 * and their documentation), not full validation semantics -- encoding the
 * semantic rules here would turn this file into a mini validation language,
 * which is explicitly out of scope for this refactor.
 */

import { VIEWPORT_PRESETS } from "../types.js";

export interface FieldSchema {
  type?: "string" | "integer" | "number" | "boolean" | "array" | "object";
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minProperties?: number;
  enum?: (string | number)[];
  const?: string;
  items?: FieldSchema;
  /** Name of a `$defs` entry to reference (becomes `{ "$ref": "#/$defs/<ref>" }`). */
  ref?: string;
  oneOf?: FieldSchema[];
  properties?: Record<string, FieldSchema>;
  required?: string[];
  additionalProperties?: boolean;
  /** Name of a `$defs` entry to use as `additionalProperties: { "$ref": ... }`. */
  additionalPropertiesRef?: string;
}

export const SFX_VARIANTS = [1, 2, 3, 4] as const;

/** Shared `oneOf` shape used by every sfx value field (click, key). */
function sfxValueField(description: string): FieldSchema {
  return {
    oneOf: [
      { type: "integer", enum: [...SFX_VARIANTS] },
      { type: "string", minLength: 1 },
    ],
    default: 1,
    description,
  };
}

export const ELEMENT_TARGET_FIELDS: Record<string, FieldSchema> = {
  text: { type: "string", description: "Visible text to match." },
  selector: { type: "string", description: "CSS selector to match." },
  within: { type: "string", description: "CSS selector to scope the search." },
};

/** `elementTarget` $defs entry: requires text or selector. */
export const ELEMENT_TARGET_DEF: FieldSchema = {
  type: "object",
  properties: ELEMENT_TARGET_FIELDS,
  oneOf: [{ required: ["text"] }, { required: ["selector"] }],
  additionalProperties: false,
};

export const VIEWPORT_DEF: FieldSchema = {
  oneOf: [
    {
      type: "string",
      enum: Object.keys(VIEWPORT_PRESETS),
      description: "Named device preset.",
    },
    {
      type: "object",
      required: ["width", "height"],
      properties: {
        width: { type: "integer", minimum: 1, description: "Viewport width in pixels." },
        height: {
          type: "integer",
          minimum: 1,
          description: "Viewport height in pixels.",
        },
      },
      additionalProperties: false,
    },
  ],
};

export const CURSOR_CONFIG_FIELDS: Record<string, FieldSchema> = {
  image: { type: "string", description: "Path to a custom cursor SVG file." },
  size: {
    type: "number",
    minimum: 1,
    default: 24,
    description: "Size of the cursor overlay in pixels.",
  },
  hotspot: {
    type: "string",
    enum: ["top-left", "center"],
    default: "top-left",
    description:
      "Where the click point lands relative to the cursor image. Use 'center' for circle/dot cursors.",
  },
};

export const CURSOR_CONFIG_DEF: FieldSchema = {
  type: "object",
  properties: CURSOR_CONFIG_FIELDS,
  additionalProperties: false,
};

export const HUD_CONFIG_FIELDS: Record<string, FieldSchema> = {
  background: {
    type: "string",
    description: "CSS background value for the keystroke HUD.",
  },
  color: { type: "string", description: "CSS text color for the keystroke HUD." },
  fontSize: {
    type: "number",
    minimum: 1,
    default: 56,
    description: "Font size in pixels for the keystroke HUD.",
  },
  fontFamily: { type: "string", description: "CSS font-family for the keystroke HUD." },
  borderRadius: {
    type: "number",
    minimum: 0,
    default: 18,
    description: "Border radius in pixels for the keystroke HUD.",
  },
  position: {
    type: "string",
    enum: ["top", "bottom"],
    default: "bottom",
    description: "Position of the keystroke HUD.",
  },
};

export const THEME_FIELDS: Record<string, FieldSchema> = {
  cursor: { ref: "cursorConfig", description: "Cursor overlay configuration." },
  hud: {
    type: "object",
    properties: HUD_CONFIG_FIELDS,
    additionalProperties: false,
  },
};

export const THEME_DEF: FieldSchema = {
  type: "object",
  properties: THEME_FIELDS,
  additionalProperties: false,
};

export const SFX_FIELDS: Record<string, FieldSchema> = {
  click: sfxValueField(
    "Mouse click sound: built-in variant (1-4) or path to a custom audio file.",
  ),
  key: sfxValueField(
    "Keyboard press sound: built-in variant (1-4) or path to a custom audio file.",
  ),
};

export const SFX_DEF: FieldSchema = {
  type: "object",
  properties: SFX_FIELDS,
  additionalProperties: false,
};

export const THUMBNAIL_FIELDS: Record<string, FieldSchema> = {
  time: {
    type: "number",
    minimum: 0,
    description: "Time in seconds to capture the thumbnail. Defaults to 0 (first frame).",
  },
  enabled: {
    type: "boolean",
    description: "Set to false to skip thumbnail generation.",
  },
};

export const THUMBNAIL_DEF: FieldSchema = {
  type: "object",
  properties: THUMBNAIL_FIELDS,
  additionalProperties: false,
};

export const AUTOZOOM_NONNEGATIVE_FIELDS: Record<string, FieldSchema> = {
  approachS: {
    type: "number",
    minimum: 0,
    default: 0.5,
    description: "Seconds spent zooming in from full frame to the target.",
  },
  settleBeforeS: {
    type: "number",
    minimum: 0,
    default: 0.15,
    description: "Seconds the camera sits on the target before the action fires.",
  },
  holdAfterS: {
    type: "number",
    minimum: 0,
    default: 0.3,
    description: "Seconds the camera holds after the last action in a session.",
  },
  releaseS: {
    type: "number",
    minimum: 0,
    default: 0.5,
    description: "Seconds spent zooming out from the target back to full frame.",
  },
  paddingRatio: {
    type: "number",
    minimum: 0,
    default: 0.3,
    description: "Fraction of the target bounding box added as padding around it.",
  },
  sessionGapS: {
    type: "number",
    minimum: 0,
    default: 4,
    description:
      "Actions within this many seconds share one zoom session; the camera pans between them instead of zooming out.",
  },
  minPanS: {
    type: "number",
    minimum: 0,
    default: 0.8,
    description:
      "Skip panning to an intermediate target when the pan would be shorter than this many seconds.",
  },
};

export const AUTOZOOM_RATIO_FIELDS: Record<string, FieldSchema> = {
  minZoomRatio: {
    type: "number",
    minimum: 0,
    maximum: 1,
    default: 0.6,
    description: "The crop is never smaller than this fraction of the viewport.",
  },
  skipZoomRatio: {
    type: "number",
    minimum: 0,
    maximum: 1,
    default: 0.75,
    description:
      "Skip zooming when the computed crop would be this fraction of the viewport or larger.",
  },
};

export const AUTOZOOM_OBJECT_FIELDS: Record<string, FieldSchema> = {
  enabled: {
    type: "boolean",
    default: true,
    description: "Turn autozoom on or off without removing the config object.",
  },
  ...AUTOZOOM_NONNEGATIVE_FIELDS,
  ...AUTOZOOM_RATIO_FIELDS,
};

export const AUTOZOOM_DEF: FieldSchema = {
  oneOf: [
    { type: "boolean", description: "Enable autozoom with default settings." },
    {
      type: "object",
      properties: AUTOZOOM_OBJECT_FIELDS,
      additionalProperties: false,
    },
  ],
};

export const DELAY_DEF: FieldSchema = {
  type: "number",
  minimum: 0,
  description:
    "Delay in milliseconds to wait after this step executes. Overrides defaultDelay for this step. For longer explicit waits, use a 'pause' step instead.",
};

export const LABEL_DEF: FieldSchema = {
  type: "string",
  description: "Display label for the HUD overlay. Shown on-screen during recording.",
};

export const DESCRIPTION_DEF: FieldSchema = {
  type: "string",
  description: "Optional description for documentation. Shown in --verbose output.",
};

/** Fields shared by (almost) every step type: label, delay, description. */
const COMMON_STEP_FIELDS: Record<string, FieldSchema> = {
  label: { ref: "label" },
  delay: { ref: "delay" },
  description: { ref: "description" },
};

interface StepDef {
  /** Name of the `$defs` entry, e.g. "stepPause". */
  defName: string;
  required: string[];
  properties: Record<string, FieldSchema>;
  /** Object-level `oneOf` of `{ required: [...] }` branches, e.g. text-or-selector. */
  requiredOneOf?: string[][];
}

/**
 * Step type registry, keyed by action name. Insertion order here is the
 * canonical action order used both for validator messages (Valid actions: ...)
 * and for the schema's `step` union.
 */
export const STEP_DEFS: Record<string, StepDef> = {
  pause: {
    defName: "stepPause",
    required: ["action", "ms"],
    properties: {
      action: { type: "string", const: "pause" },
      ms: {
        type: "number",
        minimum: 0,
        description:
          "Duration in milliseconds. For post-step delays, use the 'delay' field on any other step instead.",
      },
      // Note: pause has no "delay" field (it IS a delay); it only shares
      // label/description with the other step types.
      label: { ref: "label" },
      description: { ref: "description" },
    },
  },
  click: {
    defName: "stepClick",
    required: ["action"],
    requiredOneOf: [["text"], ["selector"]],
    properties: {
      action: { type: "string", const: "click" },
      text: { type: "string", description: "Visible text to find and click." },
      selector: { type: "string", description: "CSS selector to find and click." },
      within: { type: "string", description: "CSS selector to scope the search." },
      modifiers: {
        type: "array",
        items: { type: "string" },
        description: 'Modifier keys to hold during click (e.g. ["cmd"]).',
      },
      ...COMMON_STEP_FIELDS,
    },
  },
  key: {
    defName: "stepKey",
    required: ["action", "key"],
    properties: {
      action: { type: "string", const: "key" },
      key: {
        type: "string",
        minLength: 1,
        description:
          'Key or key combo. Combine with \'+\' (e.g. "mod+z", "cmd+shift+a"). Use "mod" for the platform modifier (cmd on macOS, ctrl elsewhere). Common keys: a-z, 0-9, Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, PageUp, PageDown, Space, F1-F12. Modifiers: mod, cmd, ctrl, shift, alt, meta.',
      },
      target: {
        oneOf: [
          { type: "string", description: "CSS selector of element to focus first." },
          { ref: "elementTarget", description: "Element target to focus first." },
        ],
      },
      label: {
        type: "string",
        description: "Display label for the keystroke HUD.",
      },
      delay: { ref: "delay" },
      description: { ref: "description" },
    },
  },
  drag: {
    defName: "stepDrag",
    required: ["action", "from", "to"],
    properties: {
      action: { type: "string", const: "drag" },
      from: { ref: "elementTarget", description: "Element to drag from." },
      to: { ref: "elementTarget", description: "Element to drag to." },
      ...COMMON_STEP_FIELDS,
    },
  },
  moveTo: {
    defName: "stepMoveTo",
    required: ["action"],
    requiredOneOf: [["text"], ["selector"]],
    properties: {
      action: { type: "string", const: "moveTo" },
      text: { type: "string", description: "Visible text of the target element." },
      selector: { type: "string", description: "CSS selector of the target element." },
      within: { type: "string", description: "CSS selector to scope the search." },
      ...COMMON_STEP_FIELDS,
    },
  },
  type: {
    defName: "stepType",
    required: ["action", "text"],
    properties: {
      action: { type: "string", const: "type" },
      text: {
        type: "string",
        minLength: 1,
        description: "Text to type character by character.",
      },
      selector: {
        type: "string",
        description: "CSS selector of the element to click before typing.",
      },
      within: { type: "string", description: "CSS selector to scope the search." },
      charDelay: {
        type: "number",
        minimum: 0,
        description: "Delay in milliseconds between keystrokes.",
      },
      method: {
        type: "string",
        enum: ["insertText", "dispatchKeyEvent"],
        description:
          "How characters are injected. 'insertText' goes through the browser text input pipeline and updates framework-controlled inputs (React and similar) but fires no keydown/keyup events. 'dispatchKeyEvent' fires raw key events. Defaults to 'insertText' when 'selector' is set, otherwise 'dispatchKeyEvent'.",
      },
      ...COMMON_STEP_FIELDS,
    },
  },
  scroll: {
    defName: "stepScroll",
    required: ["action"],
    properties: {
      action: { type: "string", const: "scroll" },
      x: { type: "number", description: "Horizontal scroll distance in pixels." },
      y: { type: "number", description: "Vertical scroll distance in pixels." },
      text: { type: "string", description: "Visible text of the element to scroll." },
      selector: { type: "string", description: "CSS selector of element to scroll." },
      within: { type: "string", description: "CSS selector to scope the search." },
      ...COMMON_STEP_FIELDS,
    },
  },
  wait: {
    defName: "stepWait",
    required: ["action"],
    requiredOneOf: [["selector"], ["text"]],
    properties: {
      action: { type: "string", const: "wait" },
      selector: { type: "string", description: "CSS selector to wait for." },
      text: { type: "string", description: "Visible text to wait for." },
      within: { type: "string", description: "CSS selector to scope the search." },
      timeout: {
        type: "number",
        minimum: 0,
        default: 30000,
        description: "Timeout in milliseconds.",
      },
      ...COMMON_STEP_FIELDS,
    },
  },
  screenshot: {
    defName: "stepScreenshot",
    required: ["action", "output"],
    properties: {
      action: { type: "string", const: "screenshot" },
      output: {
        type: "string",
        minLength: 1,
        description: "Output file path for the screenshot.",
      },
      ...COMMON_STEP_FIELDS,
    },
  },
  navigate: {
    defName: "stepNavigate",
    required: ["action", "url"],
    properties: {
      action: { type: "string", const: "navigate" },
      url: {
        type: "string",
        minLength: 1,
        description: "URL to navigate to. Resolved relative to baseUrl if set.",
      },
      ...COMMON_STEP_FIELDS,
    },
  },
  navigateHref: {
    defName: "stepNavigateHref",
    required: ["action", "selector"],
    properties: {
      action: { type: "string", const: "navigateHref" },
      selector: {
        type: "string",
        minLength: 1,
        description: "CSS selector for an element with an href attribute.",
      },
      ...COMMON_STEP_FIELDS,
    },
  },
  hover: {
    defName: "stepHover",
    required: ["action"],
    requiredOneOf: [["text"], ["selector"]],
    properties: {
      action: { type: "string", const: "hover" },
      text: { type: "string", description: "Visible text of the element to hover." },
      selector: { type: "string", description: "CSS selector of the element to hover." },
      within: { type: "string", description: "CSS selector to scope the search." },
      ...COMMON_STEP_FIELDS,
    },
  },
  select: {
    defName: "stepSelect",
    required: ["action", "value"],
    requiredOneOf: [["text"], ["selector"]],
    properties: {
      action: { type: "string", const: "select" },
      text: { type: "string", description: "Visible text of the <select> element." },
      selector: {
        type: "string",
        minLength: 1,
        description: "CSS selector of the <select> element.",
      },
      within: { type: "string", description: "CSS selector to scope the search." },
      value: { type: "string", description: "Value to select." },
      ...COMMON_STEP_FIELDS,
    },
  },
  upload: {
    defName: "stepUpload",
    required: ["action", "selector", "filePath"],
    properties: {
      action: { type: "string", const: "upload" },
      selector: {
        type: "string",
        minLength: 1,
        description: "CSS selector for the file input element.",
      },
      filePath: {
        type: "string",
        minLength: 1,
        description: "Path to the file to upload, resolved relative to the config file.",
      },
      ...COMMON_STEP_FIELDS,
    },
  },
};

export const VIDEO_FIELDS: Record<string, FieldSchema> = {
  url: {
    type: "string",
    minLength: 1,
    description: "URL to navigate to. Can be relative when baseUrl is set.",
  },
  baseUrl: {
    type: "string",
    description: "Base URL prepended to relative URLs. Overrides the top-level baseUrl.",
  },
  viewport: {
    ref: "viewport",
    description: "Viewport dimensions. Overrides the top-level viewport.",
  },
  zoom: {
    type: "number",
    description: "CSS zoom level applied to the page (e.g. 2 for 2x zoom).",
  },
  fps: {
    type: "number",
    minimum: 1,
    maximum: 120,
    default: 60,
    description:
      "Recording frame rate. Defaults to 60. Lower values (e.g. 30) reduce file size.",
  },
  quality: {
    type: "number",
    minimum: 1,
    maximum: 100,
    default: 80,
    description:
      "Output quality (1-100). Higher values produce larger files. Maps to CRF for MP4/WebM.",
  },
  waitFor: {
    oneOf: [
      { type: "string", description: "CSS selector to wait for before starting steps." },
      {
        ref: "elementTarget",
        description:
          'Element to wait for before starting steps. Use { "text": "..." } to wait for visible text.',
      },
    ],
    description:
      "Element to wait for before starting steps. A string is treated as a CSS selector.",
  },
  output: {
    type: "string",
    description: "Output file path (.mp4, .gif, or .webm). Resolved relative to outDir.",
  },
  thumbnail: { ref: "thumbnail", description: "Thumbnail generation options." },
  include: {
    type: "array",
    items: { type: "string" },
    description: "Paths to JSON files whose steps are prepended.",
  },
  theme: { ref: "theme", description: "Overlay theme. Overrides the top-level theme." },
  sfx: { ref: "sfx", description: "Sound effect variants. Overrides the top-level sfx." },
  defaultDelay: {
    type: "number",
    minimum: 0,
    description:
      "Default delay in milliseconds applied after each step. Overrides the top-level defaultDelay.",
  },
  clickDwell: {
    type: "number",
    minimum: 0,
    description:
      "Milliseconds the cursor pauses after reaching its target before clicking. Overrides the top-level clickDwell.",
  },
  autoZoom: {
    ref: "autoZoom",
    description:
      "Cinematically zoom into each action during compositing. Set true for defaults or an object to tune timing and thresholds.",
  },
  steps: {
    type: "array",
    items: { ref: "step" },
    description: "Array of action steps to execute.",
  },
};

export const VIDEO_DEF: FieldSchema = {
  type: "object",
  required: ["url", "steps"],
  properties: VIDEO_FIELDS,
  additionalProperties: false,
};

export const TOP_LEVEL_FIELDS: Record<string, FieldSchema> = {
  $schema: { type: "string", description: "JSON Schema reference for IDE support." },
  outDir: {
    type: "string",
    default: "videos",
    description:
      "Output directory for recorded videos. Resolved relative to the config file. Defaults to 'videos/'.",
  },
  baseUrl: {
    type: "string",
    description:
      'Base URL prepended to relative video URLs. Supports env var substitution (e.g. "$BASE_URL" or "${BASE_URL}").',
  },
  viewport: {
    ref: "viewport",
    description: "Default viewport dimensions for all videos.",
  },
  theme: { ref: "theme", description: "Default overlay theme for all videos." },
  sfx: { ref: "sfx", description: "Default sound effect variants for all videos." },
  include: {
    type: "array",
    items: { type: "string" },
    description: "Paths to JSON files whose steps are prepended to all videos.",
  },
  defaultDelay: {
    type: "number",
    minimum: 0,
    description:
      "Default delay in milliseconds applied after each step. Can be overridden per-video or per-step via the 'delay' field. For explicit waits between steps, use a 'pause' step instead.",
  },
  clickDwell: {
    type: "number",
    minimum: 0,
    description:
      "Milliseconds the cursor pauses after reaching its target before clicking. Simulates human dwell time. Defaults to a random 80-180ms when not set. Set to 0 to click instantly.",
  },
  videos: {
    type: "object",
    minProperties: 1,
    additionalPropertiesRef: "video",
    description: "Map of video names to their configurations.",
  },
};

export const TOP_LEVEL_REQUIRED = ["videos"];

// -- Derived allowlists consumed by validate.ts ------------------------------
//
// These are the "single source of truth" seam: validate.ts's known-key
// checks (and therefore its "did you mean" suggestions) read the key sets
// straight off this registry instead of maintaining their own copies.

/** Canonical action order, also used for the schema's `step` union. */
export const VALID_ACTIONS = new Set(Object.keys(STEP_DEFS));

export const KNOWN_TOP_LEVEL_KEYS = new Set(Object.keys(TOP_LEVEL_FIELDS));

export const KNOWN_VIDEO_KEYS = new Set(Object.keys(VIDEO_FIELDS));

export const KNOWN_STEP_KEYS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(STEP_DEFS).map(([action, def]) => [
    action,
    new Set(Object.keys(def.properties)),
  ]),
);

export const KNOWN_AUTOZOOM_KEYS = new Set(Object.keys(AUTOZOOM_OBJECT_FIELDS));

export const AUTOZOOM_NONNEGATIVE_KEYS = Object.keys(AUTOZOOM_NONNEGATIVE_FIELDS);

export const AUTOZOOM_RATIO_KEYS = Object.keys(AUTOZOOM_RATIO_FIELDS);

export const VALID_SFX_VARIANTS = new Set<number>(SFX_VARIANTS);
