"use client";

import { useEffect } from "react";
import { applyMotionAttribute } from "@/lib/motion";
import { MOTION_KEY, PAUSED } from "@/lib/motion-pause";
import { useHydrated, useStored } from "@/lib/stored";

/**
 * Keeps <html data-motion> in step with the saved pause switch on every page, including when another tab flips
 * it (stored.ts relays the storage event). Mounted by the locale layout; the layout's inline script covers the
 * moment before React runs, and this takes over after hydration. The visible control is MotionToggle in the ticker.
 */
export function MotionSync() {
  const paused = useStored("local", MOTION_KEY) === PAUSED;
  const hydrated = useHydrated();
  // Not during hydration, when the store still reads null and the inline script has already set the attribute.
  useEffect(() => {
    if (hydrated) applyMotionAttribute(paused);
  }, [hydrated, paused]);
  return null;
}
