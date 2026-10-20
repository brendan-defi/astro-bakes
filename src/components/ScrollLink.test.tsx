import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreMotion, stubAnimate, stubMatchMedia } from "@/test/motion";
import { glideTo } from "@/lib/motion";
import { ScrollLink } from "./ScrollLink";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);

function page() {
  const view = render(
    <>
      <ScrollLink href="#boxes">Pick your boxes</ScrollLink>
      <section id="boxes"><h2>In this drop</h2></section>
      <button>Next stop</button>
    </>,
  );
  const section = document.getElementById("boxes")!;
  section.getBoundingClientRect = () => ({ top: 900 }) as DOMRect;
  return Object.assign(screen.getByRole("link", { name: "Pick your boxes" }), { view });
}
/** Holds animation frames until `run()`, so a test can act mid-glide. */
function heldFrames() {
  let now = 0;
  const queue = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { queue.set(++now, cb); return now; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  return {
    run() {
      for (let i = 0; i < 50 && queue.size; i++) {
        const [[id, cb]] = queue;
        queue.delete(id);
        cb(id * 100);
      }
    },
  };
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

  it("moves keyboard focus to the section, so the next Tab carries on from there", () => {
    stubAnimate();
    stubMatchMedia(false);
    click(page());
    const section = document.getElementById("boxes")!;
    expect(document.activeElement).toBe(section);
    // Focusable only while it holds focus; not a tab stop of its own.
    expect(section.getAttribute("tabindex")).toBe("-1");
    screen.getByRole("button", { name: "Next stop" }).focus();
    expect(section.hasAttribute("tabindex")).toBe(false);
  });

  it("stops gliding when it unmounts, so it can't scroll the next page", () => {
    stubAnimate();
    stubMatchMedia(false);
    const frames = heldFrames();
    const link = page();
    click(link);
    link.view.unmount();
    frames.run();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(particles.burst).not.toHaveBeenCalled();
  });

  it("leaves modified clicks (new tab, etc.) to the browser", () => {
    stubAnimate();
    stubMatchMedia(false);
    expect(click(page(), { metaKey: true })).toBe(false);
  });
});

describe("glideTo", () => {
  beforeEach(() => stubMatchMedia(false));

  it("stops on Back/Forward", () => {
    const frames = heldFrames();
    const arrived = vi.fn();
    glideTo(900, arrived);
    window.dispatchEvent(new PopStateEvent("popstate"));
    frames.run();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(arrived).not.toHaveBeenCalled();
  });

  it("stops when the viewer clicks or taps anywhere", () => {
    const frames = heldFrames();
    glideTo(900);
    window.dispatchEvent(new Event("pointerdown"));
    frames.run();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("a new glide replaces one under way instead of fighting it", () => {
    const frames = heldFrames();
    const first = vi.fn();
    glideTo(900, first);
    glideTo(300);
    frames.run();
    expect(first).not.toHaveBeenCalled();
    expect(vi.mocked(window.scrollTo).mock.calls.at(-1)).toEqual([0, 300]);
  });
});
