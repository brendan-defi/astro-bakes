"use client";

import { useEffect } from "react";

/** Highlight colours for selected text, in order: the palette pastels plus mint and peach. Ink text reads on all of them. */
export const SELECTION_COLORS = ["var(--pink)", "var(--butter)", "var(--aqua)", "var(--lilac)", "#b6f0c2", "#ffc29a"] as const;

/** Colours nearer than this (straight-line distance in RGB) count as the same: the highlight would vanish into the background. */
const TOO_CLOSE = 40;

type RGB = [number, number, number];

/** "#rrggbb", "rgb(…)" or "rgba(…)" as RGB; null when transparent or not a colour we read. */
export function parseColor(value: string): RGB | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(v);
  if (!fn) return null;
  const [r, g, b, a = 1] = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return a === 0 ? null : [r, g, b];
}

/** The colour actually behind a node: the nearest element (itself or an ancestor) with a background that isn't transparent. */
function backgroundBehind(node: EventTarget | null): RGB | null {
  for (let el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null; el; el = el.parentElement) {
    const bg = parseColor(getComputedStyle(el).backgroundColor);
    if (bg) return bg;
  }
  return null;
}

/** Index of the next colour after `from` that stands out against `bg`, skipping any that match it (lilac on the lilac hero). */
export function nextColor(from: number, bg: RGB | null, rgbOf: (color: string) => RGB | null): number {
  for (let step = 1; step <= SELECTION_COLORS.length; step++) {
    const i = (from + step) % SELECTION_COLORS.length;
    const c = rgbOf(SELECTION_COLORS[i]);
    if (!bg || !c || Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) >= TOO_CLOSE) return i;
  }
  return (from + 1) % SELECTION_COLORS.length;
}

/**
 * Each new text selection gets the next colour (::selection in globals.css reads --selection),
 * skipping one that matches the background where the selection starts. Renders nothing.
 */
export function SelectionColors() {
  useEffect(() => {
    const root = document.documentElement;
    const rgbOf = (color: string) => parseColor(color.startsWith("var(") ? getComputedStyle(root).getPropertyValue(color.slice(4, -1)) : color);
    let i = -1;
    const onSelectStart = (e: Event) => {
      i = nextColor(i, backgroundBehind(e.target), rgbOf);
      root.style.setProperty("--selection", SELECTION_COLORS[i]);
    };
    document.addEventListener("selectstart", onSelectStart);
    return () => document.removeEventListener("selectstart", onSelectStart);
  }, []);
  return null;
}
