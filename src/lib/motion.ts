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

/**
 * A one-shot wiggle for taps (CSS :hover can't replay on phones). It moves the separate rotate/scale
 * properties, so an element's own transform (tilts, other animations) carries on underneath.
 */
export function boop(el: Element | null | undefined, { rotate = 8, scale = 1.08, duration = 550 }: { rotate?: number; scale?: number; duration?: number } = {}): void {
  if (!el || !motionOK()) return;
  el.animate([{ rotate: `${rotate}deg`, scale: String(scale), offset: 0.25, easing: springEasing() }], { duration });
}
