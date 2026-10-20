"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { boop, glideTo, motionOK } from "@/lib/motion";
import { burst } from "@/lib/particles";

/**
 * A link to a section on the same page that glides there instead of jumping, then gives the section's
 * heading a wiggle and a few sparkles as it arrives. Under reduced motion (or with a modifier key) it's an
 * ordinary anchor link. The URL still gets the #hash, as a normal anchor would add it.
 */
export function ScrollLink({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: `#${string}` }) {
  function glide(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !motionOK()) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    e.preventDefault();
    history.pushState(null, "", href);
    glideTo(target.getBoundingClientRect().top + window.scrollY, () => {
      const heading = target.querySelector("h2");
      boop(heading, { rotate: -3, scale: 1.06 });
      burst(heading, { kind: ["star", "sprinkle"], count: 9, power: 300 });
    });
  }
  return <a href={href} onClick={glide} {...rest} />;
}
