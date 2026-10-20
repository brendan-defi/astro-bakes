import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreMotion, stubAnimate, stubMatchMedia } from "@/test/motion";
import { allergenKind, particleNode } from "./particle-art";
import { burst, flyTo, MAX_LIVE } from "./particles";

const layer = () => document.querySelector<HTMLElement>("[data-particles]");
const particles = () => layer()?.querySelectorAll("svg").length ?? 0;
const settle = () => new Promise((r) => setTimeout(r, 0));
function button() {
  const el = document.createElement("button");
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; }); });
afterEach(() => { restoreMotion(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("burst", () => {
  it("does nothing without the Web Animations API (as in jsdom and old browsers)", () => {
    expect(() => burst(button(), { count: 5 })).not.toThrow();
    expect(particles()).toBe(0);
  });

  it("does nothing when the viewer prefers reduced motion", () => {
    const calls = stubAnimate();
    stubMatchMedia(true);
    burst(button(), { count: 5 });
    expect(calls).toHaveLength(0);
    expect(particles()).toBe(0);
  });

  it("throws the particles in a hidden, click-through layer, fades them out and cleans up", async () => {
    const calls = stubAnimate();
    stubMatchMedia(false);
    burst(button(), { kind: "egg", count: 6 });

    expect(layer()?.getAttribute("aria-hidden")).toBe("true");
    expect(layer()?.style.pointerEvents).toBe("none");
    expect(particles()).toBe(6);
    expect(calls).toHaveLength(6);
    for (const { keyframes } of calls) {
      expect(keyframes.at(-1)?.opacity).toBe(0);
      expect(keyframes[0].transform).toMatch(/^translate\(0\.0px, 0\.0px\)/);
    }
    await settle();
    expect(particles()).toBe(0);
  });

  it("never keeps more than MAX_LIVE particles in flight", () => {
    vi.useFakeTimers();
    stubAnimate({ pending: true });
    stubMatchMedia(false);
    for (let i = 0; i < 6; i++) burst(button(), { count: 24 });
    expect(particles()).toBe(MAX_LIVE);
    // Animations that never finish are swept up after their duration.
    vi.advanceTimersByTime(2000);
    expect(particles()).toBe(0);
  });

  it("ignores a second tap on the same element straight away", () => {
    const calls = stubAnimate();
    stubMatchMedia(false);
    const el = button();
    burst(el, { count: 3 });
    burst(el, { count: 3 });
    expect(calls).toHaveLength(3);
  });
});

describe("particleNode", () => {
  it("paints paws in bright sticker colours, not ink, so they show on the lilac hero", () => {
    for (let i = 0; i < 20; i++) {
      const tint = particleNode("paw").node.style.getPropertyValue("--c");
      expect(["var(--butter)", "var(--aqua)", "var(--white)", "var(--pink)"]).toContain(tint);
    }
  });
});

describe("allergenKind", () => {
  it("throws each allergen's ingredient, nuts and grains included, and sprinkles for the rest", () => {
    expect(["Egg", " MILK ", "Wheat", "Walnut"].map(allergenKind)).toEqual(["egg", "milk", "wheat", "walnut"]);
    expect(["peanut", "almond", "buckwheat"].map(allergenKind)).toEqual(["walnut", "walnut", "wheat"]);
    expect(allergenKind("sesame")).toBe("sprinkle");
  });
});

describe("flyTo", () => {
  function cartAt(rect: Partial<DOMRect>) {
    const el = document.createElement("a");
    el.dataset.cartTarget = "";
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, ...rect }) as DOMRect;
    document.body.appendChild(el);
    return el;
  }
  afterEach(() => { document.querySelectorAll("[data-cart-target]").forEach((el) => el.remove()); });

  it("skips the flight when no cart is on screen", () => {
    const calls = stubAnimate();
    stubMatchMedia(false);
    cartAt({ top: -200, bottom: -150, width: 44, height: 44 }); // scrolled away with the nav
    flyTo(button());
    expect(calls).toHaveLength(0);
  });

  it("flies one cookie to the visible cart and nudges it on arrival", async () => {
    const calls = stubAnimate();
    stubMatchMedia(false);
    // jsdom's window is 1024×768; the sticky cart bar sits at the bottom of it.
    const cart = cartAt({ left: 300, top: 700, right: 360, bottom: 750, width: 60, height: 50 });
    flyTo(button());
    expect(calls).toHaveLength(1);
    expect(calls[0].keyframes.at(-1)?.transform).toMatch(/^translate\(330\.0px, 725\.0px\)/);
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1].el).toBe(cart);
  });
});
