"use client";

import { useEffect } from "react";

/** Highlight colours for selected text, in order: the palette pastels plus mint and peach. Ink text reads on all of them. */
export const SELECTION_COLORS = ["var(--pink)", "var(--butter)", "var(--aqua)", "var(--lilac)", "#b6f0c2", "#ffc29a"] as const;

/** Each new text selection gets the next colour (::selection in globals.css reads --selection). Renders nothing. */
export function SelectionColors() {
  useEffect(() => {
    const root = document.documentElement;
    let i = -1;
    const next = () => {
      i = (i + 1) % SELECTION_COLORS.length;
      root.style.setProperty("--selection", SELECTION_COLORS[i]);
    };
    document.addEventListener("selectstart", next);
    return () => document.removeEventListener("selectstart", next);
  }, []);
  return null;
}
