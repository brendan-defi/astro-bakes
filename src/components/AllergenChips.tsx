"use client";

import { boop } from "@/lib/motion";
import { allergenKind } from "@/lib/particle-art";
import { burst } from "@/lib/particles";

/**
 * The "Contains" pills on a box card. Tapping one throws its ingredient out (eggs, milk, wheat, walnuts).
 * The effect is purely decorative, so the pills stay plain text: no tab stop, nothing extra announced.
 * Labels arrive translated, because a server-rendered card can't hand a function to a client component.
 */
export function AllergenChips({ items }: { items: { key: string; label: string }[] }) {
  return (
    <>
      {items.map(({ key, label }) => (
        <span
          key={key}
          className="chip-sm chip-toy"
          onPointerDown={(e) => {
            burst(e.currentTarget, { kind: allergenKind(key), count: 8, power: 420, spread: Math.PI * 0.75 });
            boop(e.currentTarget, { rotate: -6, scale: 1.12 });
          }}
        >
          {label}
        </span>
      ))}
    </>
  );
}
