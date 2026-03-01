import { describe, it, expect } from "vitest";
import { InteractionTimeline } from "../timeline.js";

describe("InteractionTimeline", () => {
  it("starts with zero frames", () => {
    const tl = new InteractionTimeline(1080, 1080);
    expect(tl.getFrameCount()).toBe(0);
    expect(tl.getEvents()).toEqual([]);
  });

  it("tick advances frame count", () => {
    const tl = new InteractionTimeline(800, 600);
    tl.tick();
    tl.tick();
    tl.tick();
    expect(tl.getFrameCount()).toBe(3);
  });

  it("tickDuplicate also advances frame count", () => {
    const tl = new InteractionTimeline(800, 600);
    tl.tick();
    tl.tickDuplicate();
    expect(tl.getFrameCount()).toBe(2);
  });

  it("addEvent records events with correct timing", () => {
    const tl = new InteractionTimeline(1080, 1080);
    for (let i = 0; i < 60; i++) tl.tick();
    tl.addEvent("click");
    const events = tl.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("click");
    expect(events[0].timeMs).toBeCloseTo(1000, 0);
  });

  it("toJSON produces valid timeline data", () => {
    const tl = new InteractionTimeline(1920, 1080, { zoom: 2 });
    tl.tick();
    const data = tl.toJSON();
    expect(data.fps).toBe(60);
    expect(data.width).toBe(1920);
    expect(data.height).toBe(1080);
    expect(data.zoom).toBe(2);
    expect(data.frames).toHaveLength(1);
    expect(data.theme.cursorSize).toBe(24);
  });

  it("load roundtrips correctly", () => {
    const tl = new InteractionTimeline(800, 600, {
      zoom: 1.5,
      cursorSize: 32,
    });
    tl.setCursorPath([{ x: 100, y: 200 }]);
    tl.tick();
    tl.addEvent("key");
    tl.tick();

    const json = tl.toJSON();
    const loaded = InteractionTimeline.load(json);
    const reJson = loaded.toJSON();

    expect(reJson.frames).toEqual(json.frames);
    expect(reJson.events).toEqual(json.events);
    expect(reJson.width).toBe(json.width);
    expect(reJson.height).toBe(json.height);
    expect(reJson.zoom).toBe(json.zoom);
  });

  it("showHud and hideHud affect frame data", () => {
    const tl = new InteractionTimeline(1080, 1080);
    tl.showHud(["Ctrl", "A"]);
    tl.tick();
    tl.hideHud();
    tl.tick();

    const data = tl.toJSON();
    expect(data.frames[0].hud).toEqual({ labels: ["Ctrl", "A"] });
    expect(data.frames[1].hud).toBeNull();
  });

  it("setCursorPath advances cursor through positions", () => {
    const tl = new InteractionTimeline(1080, 1080);
    tl.setCursorPath([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    tl.tick();
    tl.tick();
    tl.tick();

    const data = tl.toJSON();
    expect(data.frames[0].cursor.x).toBe(10);
    expect(data.frames[0].cursor.y).toBe(20);
    expect(data.frames[1].cursor.x).toBe(30);
    expect(data.frames[1].cursor.y).toBe(40);
    expect(data.frames[2].cursor.x).toBe(30);
  });
});
