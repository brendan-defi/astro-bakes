import { boop, motionOK } from "./motion";
import { particleNode, type ParticleKind } from "./particle-art";

/**
 * Particle bursts in the spirit of Josh Comeau's whimsical animations, with no library: each particle
 * is a small SVG in one fixed, click-through layer over the page, thrown with el.animate() along a
 * gravity curve and removed when it lands. Decorative only: the layer is aria-hidden, and nothing runs
 * under reduced motion or without the Web Animations API (so in tests it's a no-op unless stubbed).
 */

type Point = { x: number; y: number };

export interface BurstOptions {
  /** One kind, or several to mix (taken in turn). */
  kind?: ParticleKind | readonly ParticleKind[];
  /** 1–24, default 10. */
  count?: number;
  /** Direction the cone points, in radians; default straight up. */
  angle?: number;
  /** Width of the cone in radians; default 1.4π (up and out to both sides). */
  spread?: number;
  /** Launch speed in px/s; default 340. */
  power?: number;
  /** Downward pull in px/s²; default 950. */
  gravity?: number;
  /** ms; default 900. */
  duration?: number;
}

/** Most particles alive at once; extra ones are dropped so a tapping spree can't pile up. */
export const MAX_LIVE = 80;
/** Taps on the same element closer together than this are ignored. */
const COOLDOWN_MS = 100;
const SAMPLES = 10;

let layer: HTMLDivElement | null = null;
let live = 0;
const lastBurst = new WeakMap<Element, number>();

function getLayer(): HTMLDivElement {
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.particles = "";
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1000;contain:strict";
  document.body.appendChild(layer);
  return layer;
}

function centre(origin: Element | Point): Point {
  if (!(origin instanceof Element)) return origin;
  const r = origin.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

/** Adds a group of particles to the layer and removes it (and its count) once every animation has finished. */
function track(group: HTMLElement, count: number, anims: Animation[], duration: number, onDone?: () => void) {
  getLayer().appendChild(group);
  live += count;
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    group.remove();
    live -= count;
    onDone?.();
  };
  Promise.all(anims.map((a) => a.finished)).then(done, done);
  // In case an animation is never allowed to finish (a backgrounded tab, a cancelled animation).
  setTimeout(done, duration + 500);
}

/** Throws particles out of an element (from its centre) or from a point in viewport coordinates. */
export function burst(origin: Element | Point | null | undefined, opts: BurstOptions = {}): void {
  if (!origin || !motionOK()) return;
  if (origin instanceof Element) {
    const now = performance.now();
    if (now - (lastBurst.get(origin) ?? -Infinity) < COOLDOWN_MS) return;
    lastBurst.set(origin, now);
  }
  const count = Math.min(Math.max(1, Math.round(opts.count ?? 10)), 24, MAX_LIVE - live);
  if (count <= 0) return;
  const kinds = ([] as ParticleKind[]).concat(opts.kind ?? "sprinkle");
  const { angle = -Math.PI / 2, spread = Math.PI * 1.4, power = 340, gravity = 950, duration = 900 } = opts;
  const { x, y } = centre(origin);
  const secs = duration / 1000;

  const group = document.createElement("div");
  const anims: Animation[] = [];
  for (let i = 0; i < count; i++) {
    const { node, size } = particleNode(kinds[i % kinds.length], 0.75 + Math.random() * 0.45);
    node.style.left = `${x - size / 2}px`;
    node.style.top = `${y - size / 2}px`;
    group.appendChild(node);

    const a = angle + (Math.random() - 0.5) * spread;
    const speed = power * (0.55 + Math.random() * 0.6);
    const vx = Math.cos(a) * speed;
    const vy = Math.sin(a) * speed;
    const spin = (Math.random() - 0.5) * 720;
    const keyframes: Keyframe[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const p = k / SAMPLES;
      const t = p * secs;
      const px = vx * t;
      const py = vy * t + 0.5 * gravity * t * t;
      // Pop out small, hold full size, fade over the last 30%.
      const s = p < 0.15 ? 0.4 + (p / 0.15) * 0.6 : 1;
      keyframes.push({ transform: `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) rotate(${(spin * p).toFixed(1)}deg) scale(${s.toFixed(2)})`, opacity: p > 0.7 ? (1 - p) / 0.3 : 1 });
    }
    anims.push(node.animate(keyframes, { duration, easing: "linear", fill: "forwards" }));
  }
  track(group, count, anims, duration);
}

/**
 * Sends one particle in an arc from an element to the first on-screen element matching `target`
 * (the cart button or the sticky cart bar), then boops it. Waits a frame, so a cart bar that the
 * same tap just mounted can catch it. Skips quietly when no target is visible (the nav isn't sticky).
 */
export function flyTo(from: Element | null | undefined, { kind = "cookie", target = "[data-cart-target]", duration = 750 }: { kind?: ParticleKind; target?: string; duration?: number } = {}): void {
  if (!from || !motionOK()) return;
  const start = centre(from);
  requestAnimationFrame(() => {
    const to = Array.from(document.querySelectorAll(target)).find(onScreen);
    if (!to || live >= MAX_LIVE) return;
    const end = centre(to);
    // A quadratic curve that rises above the higher of the two points.
    const ctrl = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - 120 };
    const { node, size } = particleNode(kind, 1);
    node.style.left = `${start.x - size / 2}px`;
    node.style.top = `${start.y - size / 2}px`;
    const keyframes: Keyframe[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const t = k / SAMPLES;
      const u = 1 - t;
      const px = u * u * start.x + 2 * u * t * ctrl.x + t * t * end.x - start.x;
      const py = u * u * start.y + 2 * u * t * ctrl.y + t * t * end.y - start.y;
      keyframes.push({ transform: `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) rotate(${(540 * t).toFixed(0)}deg) scale(${(1 - 0.45 * t).toFixed(2)})` });
    }
    const group = document.createElement("div");
    group.appendChild(node);
    const anim = node.animate(keyframes, { duration, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" });
    // A wide target (the cart bar) only needs a nudge; the round nav button can take a proper wiggle.
    const wide = to.getBoundingClientRect().width > 120;
    track(group, 1, [anim], duration, () => boop(to, wide ? { rotate: -2, scale: 1.04 } : { rotate: -12, scale: 1.15 }));
  });
}
