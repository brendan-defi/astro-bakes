"use client";

import { useEffect } from "react";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { applyMotionAttribute, setMotionPaused } from "@/lib/motion";
import { MOTION_KEY, PAUSED } from "@/lib/motion-pause";
import { useHydrated, useStored } from "@/lib/stored";
import { PauseIcon, PlayIcon } from "./icons";
import s from "./Ticker.module.css";

/**
 * Pauses every animation on the site (WCAG 2.2.2): the marquee, the waves, the orbiting cookie, the bursts.
 * The switch lives in localStorage (see motion.ts), so it holds for the next page and for other tabs.
 */
export function MotionToggle({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  const paused = useStored("local", MOTION_KEY) === PAUSED;
  const hydrated = useHydrated();
  // Keep <html data-motion> in step with the saved switch, including when another tab flips it. Not during
  // hydration, when the store still reads null and the layout's inline script has already set the attribute.
  useEffect(() => {
    if (hydrated) applyMotionAttribute(paused);
  }, [hydrated, paused]);
  return (
    <button type="button" className={s.pause} aria-pressed={paused} aria-label={t.pauseMotion} onClick={() => setMotionPaused(!paused)}>
      {paused ? <PlayIcon /> : <PauseIcon />}
    </button>
  );
}
