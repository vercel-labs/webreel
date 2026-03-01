import { describe, it, expect } from "vitest";
import { RecordingContext } from "../actions.js";

describe("RecordingContext", () => {
  it("defaults to preview mode", () => {
    const ctx = new RecordingContext();
    expect(ctx.mode).toBe("preview");
    expect(ctx.isRecording).toBe(false);
  });

  it("isRecording is true when mode is record and timeline is set", () => {
    const ctx = new RecordingContext();
    ctx.setMode("record");
    expect(ctx.isRecording).toBe(false);

    ctx.setTimeline({ addEvent: () => {} } as never);
    expect(ctx.isRecording).toBe(true);
  });

  it("resetCursorPosition places cursor off-screen", () => {
    const ctx = new RecordingContext();
    ctx.resetCursorPosition(1920, 1080);
    const pos = ctx.getCursorPosition();
    const offScreen = pos.x < 0 || pos.x > 1920 || pos.y < 0 || pos.y > 1080;
    expect(offScreen).toBe(true);
  });

  it("getCursorPosition returns initial off-screen position", () => {
    const ctx = new RecordingContext();
    const pos = ctx.getCursorPosition();
    expect(pos.x).toBe(-40);
    expect(pos.y).toBe(-40);
  });

  it("markEvent delegates to recorder when set", () => {
    const ctx = new RecordingContext();
    const events: string[] = [];
    ctx.setRecorder({ addEvent: (type) => events.push(type) });
    ctx.markEvent("click");
    ctx.markEvent("key");
    expect(events).toEqual(["click", "key"]);
  });

  it("markEvent delegates to timeline when recording", () => {
    const ctx = new RecordingContext();
    const events: string[] = [];
    ctx.setMode("record");
    ctx.setTimeline({ addEvent: (type: string) => events.push(type) } as never);
    ctx.markEvent("click");
    expect(events).toEqual(["click"]);
  });
});
