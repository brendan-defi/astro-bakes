import s from "./Wave.module.css";

/**
 * Full-width scallop divider. `from` is the colour of the section above, `to` the section below.
 * It drifts sideways on a loop; `reverse` drifts the other way, so neighbouring waves don't march in step.
 */
export function Wave({ from, to, reverse = false, className }: { from: string; to: string; reverse?: boolean; className?: string }) {
  // Each T mirrors the last bulge, so the scallops alternate down and up: one wave is 130 units.
  // 1300 units are visible (preserveAspectRatio="none" stretches them across the page); one extra
  // wave on the right lets the drift shift by exactly one period and loop without a seam.
  const ends = Array.from({ length: 21 }, (_, i) => 1300 - i * 65);
  const d = `M0 0 H1430 V10 Q 1397.5 34 1365 10 ${ends.map((x) => `T ${x} 10`).join(" ")} Z`;
  return (
    <div aria-hidden className={`${s.wave} ${reverse ? s.reverse : ""} ${className ?? ""}`} style={{ background: to }}>
      <svg viewBox="0 0 1430 30" preserveAspectRatio="none">
        <path d={d} fill={from} />
      </svg>
    </div>
  );
}
