import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SELECTION_COLORS, SelectionColors } from "./SelectionColors";

afterEach(() => { cleanup(); document.documentElement.style.removeProperty("--selection"); });
const current = () => document.documentElement.style.getPropertyValue("--selection");
const select = () => document.dispatchEvent(new Event("selectstart"));

describe("SelectionColors", () => {
  it("gives each new selection the next colour, and wraps round", () => {
    render(<SelectionColors />);
    const seen = SELECTION_COLORS.map(() => { select(); return current(); });
    expect(seen).toEqual([...SELECTION_COLORS]);
    expect(new Set(seen).size).toBe(6);
    select();
    expect(current()).toBe(SELECTION_COLORS[0]);
  });

  it("stops listening when unmounted", () => {
    const { unmount } = render(<SelectionColors />);
    select();
    unmount();
    select();
    expect(current()).toBe(SELECTION_COLORS[0]);
  });
});
