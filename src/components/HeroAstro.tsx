"use client";

import { useEffect, useRef } from "react";
import { boop, motionOK, useReducedMotion } from "@/lib/motion";
import { burst } from "@/lib/particles";
import { CookieToy } from "./CookieToy";
import { StarShape } from "./icons";
import s from "./home.module.css";

/** The pink orbit, in the 340×340 box of its svgs: the back arc passes behind Astro, the front arc in front. */
const BACK_ARC = "M4 216 C -34 150, 110 56, 250 50 C 344 46, 376 92, 334 140";
const FRONT_ARC = "M334 198 C 300 264, 150 322, 60 294";
const BOX = 340;
const ORBIT_MS = 16_000;
const withoutMove = (d: string) => d.replace(/^M\S+ \S+ /, "");

/**
 * Astro on his moon, with the cookie orbiting him. Tap him for a wiggle and a puff of paws, hearts and
 * cookies, or catch the cookie for a shower of cookies
 * (decorative, so the photo keeps its alt text and no tab stop). The cookie's route is measured from
 * the orbit drawing itself, starting and ending where it rests today; under reduced motion it stays put.
 */
export function HeroAstro({ photo, alt, bubble }: { photo: string; alt: string; bubble: string }) {
  const reduced = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const orbiterRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const box = boxRef.current, orbiter = orbiterRef.current, route = routeRef.current;
    if (reduced || !box || !orbiter || !route || !motionOK()) return;
    // Where the cookie rests (it differs by breakpoint), in orbit units.
    const unit = BOX / box.getBoundingClientRect().width;
    const [rx, ry] = getComputedStyle(orbiter).translate.split(" ").map((v) => parseFloat(v) * unit);
    if (!Number.isFinite(rx) || !Number.isFinite(ry)) return;

    // Rest → up the back arc behind Astro → down the right side → along the front arc → home.
    // Measuring each prefix gives where the back arc starts and ends along the whole route.
    const toBack = `M${rx} ${ry} L4 216`;
    route.setAttribute("d", toBack);
    const backStart = route.getTotalLength();
    route.setAttribute("d", `${toBack} ${withoutMove(BACK_ARC)}`);
    const backEnd = route.getTotalLength();
    route.setAttribute("d", `${toBack} ${withoutMove(BACK_ARC)} L334 198 ${withoutMove(FRONT_ARC)} L${rx} ${ry}`);
    const total = route.getTotalLength();

    const steps = 120;
    const moves: Keyframe[] = [];
    for (let i = 0; i <= steps; i++) {
      const p = route.getPointAtLength((total * i) / steps);
      // Higher on the tilted orbit is further away: shrink a little.
      const depth = Math.min(1, Math.max(0, (p.y - 50) / 250));
      moves.push({ translate: `${((p.x / BOX) * 100).toFixed(2)}cqw ${((p.y / BOX) * 100).toFixed(2)}cqw`, scale: (0.8 + 0.2 * depth).toFixed(3) });
    }
    // Behind the photo while on the back arc, in front of it otherwise.
    const layers: Keyframe[] = [
      { zIndex: 6, offset: 0, easing: "step-end" },
      { zIndex: 3, offset: backStart / total, easing: "step-end" },
      { zIndex: 6, offset: backEnd / total, easing: "step-end" },
      { zIndex: 6, offset: 1 },
    ];
    const anims = [
      orbiter.animate(moves, { duration: ORBIT_MS, iterations: Infinity, easing: "linear", delay: 1200 }),
      orbiter.animate(layers, { duration: ORBIT_MS, iterations: Infinity, delay: 1200 }),
    ];
    return () => anims.forEach((a) => a.cancel());
  }, [reduced]);

  return (
    <div className={s.heroVisual}>
      <div ref={boxRef} className={s.astro}>
        <div className={s.astroMoon} />
        <svg viewBox="0 0 340 340" aria-hidden className={`${s.astroOrbit} ${s.astroOrbitBack}`}>
          <path d={BACK_ARC} fill="none" stroke="var(--ink)" strokeWidth="11" strokeLinecap="round" />
          <path d={BACK_ARC} fill="none" stroke="var(--pink)" strokeWidth="6" strokeLinecap="round" />
          {/* The cookie's route, measured in the browser; never drawn. */}
          <path ref={routeRef} d={BACK_ARC} fill="none" stroke="none" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt={alt}
          className={`${s.astroPhoto} ${s.astroBoop}`}
          draggable={false}
          onPointerDown={(e) => {
            boop(e.currentTarget, { rotate: -5, scale: 1.05 });
            burst({ x: e.clientX, y: e.clientY }, { kind: ["paw", "heart", "cookie", "paw"], count: 11, power: 400 });
          }}
        />
        <svg viewBox="0 0 340 340" aria-hidden className={`${s.astroOrbit} ${s.astroOrbitFront}`}>
          <path d={FRONT_ARC} fill="none" stroke="var(--ink)" strokeWidth="11" strokeLinecap="round" />
          <path d={FRONT_ARC} fill="none" stroke="var(--pink)" strokeWidth="6" strokeLinecap="round" />
        </svg>
        <div ref={orbiterRef} className={s.orbiter} aria-hidden>
          {/* Catch the cookie for a shower of cookies. */}
          <CookieToy className={s.astroCookie} />
        </div>
        <StarShape className={s.astroStar} />
        <StarShape className={s.astroStar2} fill="var(--white)" strokeWidth={3.5} />
        <div className={s.bubble}>{bubble}</div>
      </div>
    </div>
  );
}
