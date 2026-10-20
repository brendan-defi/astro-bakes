"use client";

import { useLayoutEffect, useRef, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { boop, glideTo, motionOK } from "@/lib/motion";
import { burst } from "@/lib/particles";

/**
 * A link to a section on the same page that glides there instead of jumping, then gives the section's
 * heading a wiggle and a few sparkles as it arrives. Under reduced motion (or with a modifier key) it's an
 * ordinary anchor link. The URL still gets the #hash and keyboard focus moves to the section, as a normal
 * anchor would do.
 */
export function ScrollLink({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: `#${string}` }) {
  const stopGlide = useRef<() => void>(null);
  // Leaving mid-glide (another link, Back) mustn't keep scrolling whatever page comes next. A layout
  // effect, because a plain effect's cleanup waits until after paint: one more frame of glide on the new page.
  useLayoutEffect(() => () => stopGlide.current?.(), []);
  function glide(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !motionOK()) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    e.preventDefault();
    history.pushState(null, "", href);
    focusSection(target);
    stopGlide.current = glideTo(target.getBoundingClientRect().top + window.scrollY, () => {
      const heading = target.querySelector("h2");
      boop(heading, { rotate: -3, scale: 1.06 });
      burst(heading, { kind: ["star", "sprinkle"], count: 9, power: 300 });
    });
  }
  return <a href={href} onClick={glide} {...rest} />;
}

/**
 * Moves keyboard focus to the section, as jumping to an anchor does, so the next Tab carries on from there
 * instead of from the link back up the page. A section can't take focus, so it's made able to for as long
 * as it holds it; preventScroll leaves the scrolling to the glide.
 */
function focusSection(el: HTMLElement) {
  if (!el.hasAttribute("tabindex")) {
    el.tabIndex = -1;
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
  }
  el.focus({ preventScroll: true });
}
