import { describe, it, expect } from "vitest";
import { Recorder } from "../recorder.js";

describe("Recorder capture parameters", () => {
  it("captures at the emulated size when there is no zoom", () => {
    const recorder = new Recorder(1920, 1024, {
      capture: { width: 1920, height: 1024, scale: 1 },
    });
    expect(recorder.getCaptureParams().clip).toBeUndefined();
  });

  it("applies the zoom with clip.scale rather than a device scale factor", () => {
    const recorder = new Recorder(1920, 1024, {
      capture: { width: 3008, height: 1604, scale: 0.638 },
    });
    expect(recorder.getCaptureParams().clip).toEqual({
      x: 0,
      y: 0,
      width: 3008,
      height: 1604,
      scale: 0.638,
    });
  });
});
