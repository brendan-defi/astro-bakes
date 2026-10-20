import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextColor, parseColor, SELECTION_COLORS, SelectionColors } from "./SelectionColors";

const TOKENS: Record<string, string> = { "--pink": "#ff9ccb", "--butter": "#ffe066", "--aqua": "#7de8e4", "--lilac": "#cdb4ff" };
const root = document.documentElement;
beforeEach(() => { for (const [name, value] of Object.entries(TOKENS)) root.style.setProperty(name, value); });
afterEach(() => { cleanup(); root.removeAttribute("style"); });

const current = () => root.style.getPropertyValue("--selection");
/** Starts a selection inside `el` (the event target is where the selection begins). */
const selectIn = (el: Node = document.body) => el.dispatchEvent(new Event("selectstart", { bubbles: true }));

describe("SelectionColors", () => {
  it("gives each new selection the next colour, and wraps round", () => {
    render(<SelectionColors />);
    const seen = SELECTION_COLORS.map(() => { selectIn(); return current(); });
    expect(seen).toEqual([...SELECTION_COLORS]);
    selectIn();
    expect(current()).toBe(SELECTION_COLORS[0]);
  });

  it("skips the colour of the background the selection starts on (no lilac on the lilac hero)", () => {
    render(
      <section style={{ background: "#cdb4ff" }}>
        <p>Cookies and banana bread</p>
      </section>,
    );
    render(<SelectionColors />);
    const text = document.querySelector("p")!.firstChild!;
    const seen = Array.from({ length: 10 }, () => { selectIn(text); return current(); });
    expect(seen).not.toContain("var(--lilac)");
    // The other five still take turns.
    expect(new Set(seen).size).toBe(5);
  });

  it("stops listening when unmounted", () => {
    const { unmount } = render(<SelectionColors />);
    selectIn();
    unmount();
    selectIn();
    expect(current()).toBe(SELECTION_COLORS[0]);
  });
});

describe("nextColor", () => {
  const rgbOf = (c: string) => parseColor(c.startsWith("var(") ? TOKENS[c.slice(4, -1)] : c);

  it("skips any colour too close to the background, butter on the butter section included", () => {
    const butter = parseColor("rgb(255, 224, 102)");
    expect(nextColor(0, butter, rgbOf)).toBe(2); // pink → (butter skipped) → aqua
  });

  it("takes the next colour when the background is unknown or far from all of them", () => {
    expect(nextColor(-1, null, rgbOf)).toBe(0);
    expect(nextColor(5, parseColor("#2a1b5e"), rgbOf)).toBe(0); // ink: everything shows
  });

  it("reads hex, rgb() and transparent rgba()", () => {
    expect(parseColor("#7de8e4")).toEqual([125, 232, 228]);
    expect(parseColor("rgb(205, 180, 255)")).toEqual([205, 180, 255]);
    expect(parseColor("rgba(0, 0, 0, 0)")).toBeNull();
  });
});
