import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreMotion, stubAnimate, stubMatchMedia } from "@/test/motion";
import { ScrollLink } from "./ScrollLink";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);

function page() {
  render(
    <>
      <ScrollLink href="#boxes">Pick your boxes</ScrollLink>
      <section id="boxes"><h2>In this drop</h2></section>
    </>,
  );
  const section = document.getElementById("boxes")!;
  section.getBoundingClientRect = () => ({ top: 900 }) as DOMRect;
  return screen.getByRole("link", { name: "Pick your boxes" });
}
/** Returns whether the click was taken over (default prevented). */
const click = (link: HTMLElement, init: MouseEventInit = {}) => !fireEvent.click(link, { button: 0, ...init });

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  // Frames 100ms apart, run at once.
  let now = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb((now += 100)); return now; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => { cleanup(); restoreMotion(); vi.unstubAllGlobals(); particles.burst.mockReset(); window.history.replaceState(null, "", "/"); });

describe("ScrollLink", () => {
  it("is an ordinary anchor link under reduced motion", () => {
    stubAnimate();
    stubMatchMedia(true);
    expect(click(page())).toBe(false);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("glides to the section with an eased scroll, keeps the #hash, then wiggles its heading", () => {
    const calls = stubAnimate();
    stubMatchMedia(false);
    expect(click(page())).toBe(true);
    expect(window.location.hash).toBe("#boxes");
    const ys = vi.mocked(window.scrollTo).mock.calls.map(([, y]) => y as unknown as number);
    expect(ys.at(-1)).toBe(900);
    // Eased: slow start, so the first step covers less than a linear share of the trip.
    expect(ys[0]).toBeLessThan(900 / ys.length);
    expect(calls.map((c) => c.el.tagName)).toContain("H2");
    expect(particles.burst).toHaveBeenCalledWith(screen.getByRole("heading", { name: "In this drop" }), expect.anything());
  });

  it("leaves modified clicks (new tab, etc.) to the browser", () => {
    stubAnimate();
    stubMatchMedia(false);
    expect(click(page(), { metaKey: true })).toBe(false);
  });
});
