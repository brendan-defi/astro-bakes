"use client";

import type { SVGProps } from "react";
import { boop } from "@/lib/motion";
import { burst } from "@/lib/particles";
import { CookieShape } from "./icons";

/**
 * A decorative cookie that spins and spews cookies when tapped: the hero's orbiting cookie and the party
 * section's pair. Decoration only, so no button role or tab stop (like the allergen pills).
 */
export function CookieToy({ className = "", ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <CookieShape
      {...rest}
      className={`tap-toy ${className}`}
      onPointerDown={(e) => {
        boop(e.currentTarget, { rotate: 25, scale: 1.2 });
        burst(e.currentTarget, { kind: ["cookie", "cookie", "crumb", "cookie"], count: 14, power: 460, spread: Math.PI * 1.7 });
      }}
    />
  );
}
