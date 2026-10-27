"use client";

import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { setMotionPaused } from "@/lib/motion";
import { MOTION_KEY, PAUSED } from "@/lib/motion-pause";
import { useStored } from "@/lib/stored";
import { PauseIcon, PlayIcon } from "./icons";
import s from "./Ticker.module.css";

/**
 * Pauses every animation on the site (WCAG 2.2.2): the marquee, the waves, the orbiting cookie, the bursts.
 * The switch lives in localStorage (see motion.ts), so it holds for the next page and for other tabs; MotionSync
 * in the layout turns it into the <html data-motion> attribute on every page.
 */
export function MotionToggle({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  const paused = useStored("local", MOTION_KEY) === PAUSED;
  return (
    <button type="button" className={s.pause} aria-pressed={paused} aria-label={t.pauseMotion} onClick={() => setMotionPaused(!paused)}>
      {paused ? <PlayIcon /> : <PauseIcon />}
    </button>
  );
}
