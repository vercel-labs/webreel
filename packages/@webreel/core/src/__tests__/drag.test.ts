import { describe, it, expect } from "vitest";
import { stripGhostIdentity } from "../actions.js";

describe("stripGhostIdentity", () => {
  function fakeElement(
    attrs: Record<string, string>,
    children: Record<string, string>[] = [],
  ) {
    const make = (a: Record<string, string>) => ({
      attrs: { ...a },
      get attributes() {
        return Object.keys(this.attrs).map((name) => ({ name }));
      },
      removeAttribute(name: string) {
        delete this.attrs[name];
      },
      querySelectorAll: () => [] as never[],
    });
    const root = make(attrs);
    const kids = children.map(make);
    root.querySelectorAll = () => kids as never;
    return { root, kids };
  }

  it("removes the attributes a later selector lookup could match", () => {
    const { root } = fakeElement({
      id: "weight",
      name: "weight",
      "data-testid": "slider-weight",
      "data-state": "active",
      role: "slider",
      class: "thumb",
    });
    stripGhostIdentity(root);
    expect(root.attrs).toEqual({ role: "slider", class: "thumb" });
  });

  it("strips descendants too", () => {
    const { root, kids } = fakeElement({ id: "row" }, [
      { id: "input", "data-testid": "value" },
    ]);
    stripGhostIdentity(root);
    expect(root.attrs).toEqual({});
    expect(kids[0].attrs).toEqual({});
  });
});
