import { vi } from "vitest";

/**
 * jsdom has neither window.matchMedia nor el.animate(), so motion code is a no-op in tests by default.
 * These turn them on for a test; call restoreMotion() in afterEach.
 */

export function stubMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: reduced && query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

export interface AnimateCall { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions }

/** Records el.animate() calls. Animations finish at once unless `pending` keeps them running. */
export function stubAnimate({ pending = false }: { pending?: boolean } = {}): AnimateCall[] {
  const calls: AnimateCall[] = [];
  Element.prototype.animate = vi.fn(function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ el: this, keyframes, options });
    return { finished: pending ? new Promise(() => {}) : Promise.resolve(), cancel: vi.fn() } as unknown as Animation;
  }) as unknown as typeof Element.prototype.animate;
  return calls;
}

export function restoreMotion() {
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (Element.prototype as { animate?: unknown }).animate;
}
