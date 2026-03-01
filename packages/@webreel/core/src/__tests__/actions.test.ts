import { describe, it, expect } from "vitest";
import {
  modKey,
  RecordingContext,
  resolveMod,
  modifierFlag,
  modifiersToFlag,
  modLabel,
  modKeyInfo,
  resolveCommands,
  KEY_CODES,
  CHAR_CODES,
  SHORTCUT_COMMANDS,
} from "../actions.js";

describe("modKey", () => {
  it("returns cmd or ctrl based on platform", () => {
    const result = modKey();
    if (process.platform === "darwin") {
      expect(result).toBe("cmd");
    } else {
      expect(result).toBe("ctrl");
    }
  });
});

describe("resolveMod", () => {
  it('resolves "mod" to platform-specific key', () => {
    const result = resolveMod("mod");
    if (process.platform === "darwin") {
      expect(result).toBe("cmd");
    } else {
      expect(result).toBe("ctrl");
    }
  });

  it("passes through non-mod values unchanged", () => {
    expect(resolveMod("shift")).toBe("shift");
    expect(resolveMod("alt")).toBe("alt");
    expect(resolveMod("ctrl")).toBe("ctrl");
    expect(resolveMod("cmd")).toBe("cmd");
  });

  it("is case-insensitive for mod", () => {
    const lower = resolveMod("mod");
    const upper = resolveMod("MOD");
    const mixed = resolveMod("Mod");
    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });
});

describe("modifierFlag", () => {
  it("maps alt to 1", () => {
    expect(modifierFlag("alt")).toBe(1);
  });

  it("maps ctrl to 2", () => {
    expect(modifierFlag("ctrl")).toBe(2);
    expect(modifierFlag("control")).toBe(2);
  });

  it("maps cmd/meta to 4", () => {
    expect(modifierFlag("cmd")).toBe(4);
    expect(modifierFlag("meta")).toBe(4);
  });

  it("maps shift to 8", () => {
    expect(modifierFlag("shift")).toBe(8);
  });

  it("returns 0 for unknown modifiers", () => {
    expect(modifierFlag("unknown")).toBe(0);
  });
});

describe("modifiersToFlag", () => {
  it("returns 0 for undefined or empty array", () => {
    expect(modifiersToFlag(undefined)).toBe(0);
    expect(modifiersToFlag([])).toBe(0);
  });

  it("combines multiple modifiers with bitwise OR", () => {
    expect(modifiersToFlag(["alt", "shift"])).toBe(1 | 8);
    expect(modifiersToFlag(["ctrl", "meta"])).toBe(2 | 4);
    expect(modifiersToFlag(["alt", "ctrl", "shift", "meta"])).toBe(1 | 2 | 4 | 8);
  });

  it("is case-insensitive", () => {
    expect(modifiersToFlag(["ALT", "SHIFT"])).toBe(1 | 8);
  });
});

describe("modLabel", () => {
  it("returns command symbol for cmd/meta", () => {
    expect(modLabel("cmd")).toBe("\u2318");
    expect(modLabel("meta")).toBe("\u2318");
  });

  it("returns Ctrl for ctrl/control", () => {
    expect(modLabel("ctrl")).toBe("Ctrl");
    expect(modLabel("control")).toBe("Ctrl");
  });

  it("returns shift symbol for shift", () => {
    expect(modLabel("shift")).toBe("\u21E7");
  });

  it("returns option symbol for alt", () => {
    expect(modLabel("alt")).toBe("\u2325");
  });

  it("returns the original string for unknown modifiers", () => {
    expect(modLabel("foo")).toBe("foo");
  });
});

describe("modKeyInfo", () => {
  it("returns key info for cmd/meta", () => {
    const info = modKeyInfo("cmd");
    expect(info).toEqual({
      key: "Meta",
      code: "MetaLeft",
      keyCode: 91,
      location: 1,
    });
    expect(modKeyInfo("meta")).toEqual(info);
  });

  it("returns key info for ctrl/control", () => {
    const info = modKeyInfo("ctrl");
    expect(info).toEqual({
      key: "Control",
      code: "ControlLeft",
      keyCode: 17,
      location: 1,
    });
    expect(modKeyInfo("control")).toEqual(info);
  });

  it("returns key info for shift", () => {
    expect(modKeyInfo("shift")).toEqual({
      key: "Shift",
      code: "ShiftLeft",
      keyCode: 16,
      location: 1,
    });
  });

  it("returns key info for alt", () => {
    expect(modKeyInfo("alt")).toEqual({
      key: "Alt",
      code: "AltLeft",
      keyCode: 18,
      location: 1,
    });
  });

  it("returns null for unknown modifiers", () => {
    expect(modKeyInfo("unknown")).toBeNull();
  });
});

describe("resolveCommands", () => {
  it("resolves meta+z to undo", () => {
    expect(resolveCommands(["meta"], "z")).toEqual(["undo"]);
  });

  it("resolves meta+shift+z to redo", () => {
    expect(resolveCommands(["meta", "shift"], "z")).toEqual(["redo"]);
  });

  it("resolves ctrl+a to selectAll", () => {
    expect(resolveCommands(["ctrl"], "a")).toEqual(["selectAll"]);
  });

  it("resolves ctrl+c to copy", () => {
    expect(resolveCommands(["ctrl"], "c")).toEqual(["copy"]);
  });

  it("resolves ctrl+x to cut", () => {
    expect(resolveCommands(["ctrl"], "x")).toEqual(["cut"]);
  });

  it("resolves ctrl+v to paste", () => {
    expect(resolveCommands(["ctrl"], "v")).toEqual(["paste"]);
  });

  it("resolves mod to platform-specific modifier", () => {
    const result = resolveCommands(["mod"], "z");
    expect(result).toEqual(["undo"]);
  });

  it("returns undefined for unknown shortcuts", () => {
    expect(resolveCommands(["meta"], "q")).toBeUndefined();
  });
});

describe("KEY_CODES", () => {
  it("contains expected keys", () => {
    expect(KEY_CODES.Enter).toEqual({ code: "Enter", keyCode: 13 });
    expect(KEY_CODES.Escape).toEqual({ code: "Escape", keyCode: 27 });
    expect(KEY_CODES.Tab).toEqual({ code: "Tab", keyCode: 9 });
    expect(KEY_CODES.Backspace).toEqual({ code: "Backspace", keyCode: 8 });
    expect(KEY_CODES.Delete).toEqual({ code: "Delete", keyCode: 46 });
    expect(KEY_CODES.ArrowUp).toEqual({ code: "ArrowUp", keyCode: 38 });
    expect(KEY_CODES.ArrowDown).toEqual({ code: "ArrowDown", keyCode: 40 });
    expect(KEY_CODES.ArrowLeft).toEqual({ code: "ArrowLeft", keyCode: 37 });
    expect(KEY_CODES.ArrowRight).toEqual({ code: "ArrowRight", keyCode: 39 });
  });

  it("contains letter keys a-d, v, x, z", () => {
    expect(KEY_CODES.a).toEqual({ code: "KeyA", keyCode: 65 });
    expect(KEY_CODES.z).toEqual({ code: "KeyZ", keyCode: 90 });
    expect(KEY_CODES.v).toEqual({ code: "KeyV", keyCode: 86 });
  });
});

describe("CHAR_CODES", () => {
  it("maps space correctly", () => {
    expect(CHAR_CODES[" "]).toEqual({ code: "Space", keyCode: 32 });
  });

  it("maps digits correctly", () => {
    expect(CHAR_CODES["0"]).toEqual({ code: "Digit0", keyCode: 48 });
    expect(CHAR_CODES["9"]).toEqual({ code: "Digit9", keyCode: 57 });
  });

  it("maps punctuation correctly", () => {
    expect(CHAR_CODES["."]).toEqual({ code: "Period", keyCode: 190 });
    expect(CHAR_CODES[","]).toEqual({ code: "Comma", keyCode: 188 });
    expect(CHAR_CODES["/"]).toEqual({ code: "Slash", keyCode: 191 });
  });
});

describe("SHORTCUT_COMMANDS", () => {
  it("has meta and ctrl variants for standard shortcuts", () => {
    expect(SHORTCUT_COMMANDS["meta+a"]).toEqual(["selectAll"]);
    expect(SHORTCUT_COMMANDS["ctrl+a"]).toEqual(["selectAll"]);
    expect(SHORTCUT_COMMANDS["meta+c"]).toEqual(["copy"]);
    expect(SHORTCUT_COMMANDS["ctrl+c"]).toEqual(["copy"]);
    expect(SHORTCUT_COMMANDS["meta+z"]).toEqual(["undo"]);
    expect(SHORTCUT_COMMANDS["ctrl+z"]).toEqual(["undo"]);
    expect(SHORTCUT_COMMANDS["meta+shift+z"]).toEqual(["redo"]);
    expect(SHORTCUT_COMMANDS["ctrl+shift+z"]).toEqual(["redo"]);
  });
});

describe("RecordingContext", () => {
  it("defaults to preview mode", () => {
    const ctx = new RecordingContext();
    expect(ctx.mode).toBe("preview");
    expect(ctx.isRecording).toBe(false);
  });

  it("reports isRecording only when mode is record and timeline is set", () => {
    const ctx = new RecordingContext();
    ctx.setMode("record");
    expect(ctx.isRecording).toBe(false);
    ctx.setTimeline({ addEvent: () => {} } as never);
    expect(ctx.isRecording).toBe(true);
  });

  it("tracks cursor position", () => {
    const ctx = new RecordingContext();
    ctx.setCursorPosition(100, 200);
    expect(ctx.cursorX).toBe(100);
    expect(ctx.cursorY).toBe(200);
    expect(ctx.getCursorPosition()).toEqual({ x: 100, y: 200 });
  });

  it("getClickDwellMs uses configured value when set", () => {
    const ctx = new RecordingContext();
    ctx.setClickDwell(50);
    expect(ctx.getClickDwellMs()).toBe(50);
  });

  it("getClickDwellMs returns random value in range when not configured", () => {
    const ctx = new RecordingContext();
    for (let i = 0; i < 20; i++) {
      const dwell = ctx.getClickDwellMs();
      expect(dwell).toBeGreaterThanOrEqual(80);
      expect(dwell).toBeLessThanOrEqual(180);
    }
  });

  it("markEvent delegates to timeline and recorder", () => {
    const ctx = new RecordingContext();
    const events: string[] = [];
    ctx.setMode("record");
    ctx.setTimeline({ addEvent: (t: string) => events.push(`tl:${t}`) } as never);
    ctx.setRecorder({ addEvent: (t: string) => events.push(`rec:${t}`) } as never);
    ctx.markEvent("click");
    expect(events).toEqual(["tl:click", "rec:click"]);
  });

  it("markEvent skips timeline when not recording", () => {
    const ctx = new RecordingContext();
    const events: string[] = [];
    ctx.setRecorder({ addEvent: (t: string) => events.push(`rec:${t}`) } as never);
    ctx.markEvent("key");
    expect(events).toEqual(["rec:key"]);
  });
});
