/**
 * The viewer's own pause switch for the site's animations (MotionToggle in the ticker; WCAG 2.2.2).
 * Constants only: the server layout inlines them into the script that applies the switch before React
 * runs, and a Server Component can't import motion.ts (it uses React's useSyncExternalStore).
 */
export const MOTION_KEY = "ab-motion";
export const PAUSED = "paused";
/** <html data-motion="paused"> turns on the stylesheet's animation kill switch (globals.css). */
export const MOTION_ATTR = "motion";
