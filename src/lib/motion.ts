import { useSyncExternalStore } from "react";

/**
 * Helpers for motion driven from JS (Web Animations API). The reduced-motion rule in globals.css
 * only stops CSS animations and transitions; el.animate() ignores it, so everything here checks first.
 */

const REDUCED = "(prefers-reduced-motion: reduce)";

/** True when we may animate from JS: the browser has el.animate() and the viewer hasn't asked for reduced motion. */
export function motionOK(): boolean {
  if (typeof window === "undefined" || typeof Element === "undefined" || typeof Element.prototype.animate !== "function") return false;
  return !window.matchMedia?.(REDUCED).matches;
}

function subscribe(onChange: () => void) {
  const mq = typeof window === "undefined" ? undefined : window.matchMedia?.(REDUCED);
  mq?.addEventListener?.("change", onChange);
  return () => mq?.removeEventListener?.("change", onChange);
}

/** Live reduced-motion preference for components that start long-running animations. False on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => !!window.matchMedia?.(REDUCED).matches, () => false);
}

const FALLBACK_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
let spring: string | null = null;

/**
 * The --ease-spring token from globals.css, which is a linear() spring only where the browser supports it
 * (el.animate() throws on an easing it can't parse), otherwise an overshooting bezier.
 */
export function springEasing(): string {
  if (spring === null) {
    const token = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue("--ease-spring").trim();
    spring = token || FALLBACK_SPRING;
  }
  return spring;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** What stops a glide: the viewer taking over (wheel, touch, click, key) or going Back/Forward. */
const GLIDE_STOPPERS = ["wheel", "touchstart", "pointerdown", "keydown", "popstate"] as const;
/** The glide under way, if any: a new one replaces it instead of fighting it for the scroll position. */
let gliding: (() => void) | null = null;

/**
 * Scrolls the window to `top` with an ease-in-out glide (the browser's own smooth scroll can't be
 * eased or followed by anything). Longer trips take a little longer. Any wheel, touch, click or key
 * from the viewer, or Back/Forward, stops it on the spot. Returns a function that cancels it.
 */
export function glideTo(top: number, onArrive?: () => void): () => void {
  gliding?.();
  const from = window.scrollY;
  const distance = top - from;
  const duration = Math.min(1200, Math.max(650, Math.abs(distance) * 0.9));
  let frame = 0;
  let start: number | null = null;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of GLIDE_STOPPERS) window.removeEventListener(type, stop);
    if (gliding === stop) gliding = null;
  };
  gliding = stop;
  for (const type of GLIDE_STOPPERS) window.addEventListener(type, stop, { passive: true });
  const step = (now: number) => {
    start ??= now;
    const t = Math.min(1, (now - start) / duration);
    window.scrollTo(0, from + distance * easeInOutCubic(t));
    if (t < 1) frame = requestAnimationFrame(step);
    else { stop(); onArrive?.(); }
  };
  frame = requestAnimationFrame(step);
  return stop;
}

/**
 * A one-shot wiggle for taps (CSS :hover can't replay on phones). It moves the separate rotate/scale
 * properties, so an element's own transform (tilts, other animations) carries on underneath.
 */
export function boop(el: Element | null | undefined, { rotate = 8, scale = 1.08, duration = 550 }: { rotate?: number; scale?: number; duration?: number } = {}): void {
  if (!el || !motionOK()) return;
  el.animate([{ rotate: `${rotate}deg`, scale: String(scale), offset: 0.25, easing: springEasing() }], { duration });
}
