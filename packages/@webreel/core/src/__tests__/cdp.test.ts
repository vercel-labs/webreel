import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { connectCDP } from "../cdp.js";

let fakeClient: EventEmitter;

vi.mock("chrome-remote-interface", () => ({
  default: vi.fn(() => Promise.resolve(fakeClient)),
}));

describe("connectCDP", () => {
  it("registers an 'error' listener so an emitted error does not throw", async () => {
    fakeClient = new EventEmitter();
    const onConnectionLost = vi.fn();

    await connectCDP(9222, onConnectionLost);

    expect(() => fakeClient.emit("error", new Error("socket blew up"))).not.toThrow();
    expect(onConnectionLost).toHaveBeenCalledTimes(1);
    const err = onConnectionLost.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/CDP connection error/);
  });

  it("registers a 'disconnect' listener that reports a descriptive error", async () => {
    fakeClient = new EventEmitter();
    const onConnectionLost = vi.fn();

    await connectCDP(9222, onConnectionLost);

    expect(() => fakeClient.emit("disconnect")).not.toThrow();
    expect(onConnectionLost).toHaveBeenCalledTimes(1);
    const err = onConnectionLost.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/CDP connection lost/);
  });

  it("invokes the callback exactly once even if both events fire", async () => {
    fakeClient = new EventEmitter();
    const onConnectionLost = vi.fn();

    await connectCDP(9222, onConnectionLost);

    fakeClient.emit("error", new Error("boom"));
    fakeClient.emit("disconnect");
    fakeClient.emit("error", new Error("boom again"));

    expect(onConnectionLost).toHaveBeenCalledTimes(1);
  });

  it("works without a callback (no-op, prevents unhandled 'error' crash)", async () => {
    fakeClient = new EventEmitter();

    await connectCDP(9222);

    expect(() => fakeClient.emit("error", new Error("no listener needed"))).not.toThrow();
    expect(() => fakeClient.emit("disconnect")).not.toThrow();
  });
});
