/** Full-width scallop divider. `from` is the colour of the section above, `to` the section below. */
export function Wave({ from, to, className }: { from: string; to: string; className?: string }) {
  // 20 scallops of 65px across a 1300px box; preserveAspectRatio="none" stretches it.
  const scallops = Array.from({ length: 20 }, (_, i) => 1235 - i * 65);
  const d = `M0 0 H1300 V10 Q 1267.5 34 1235 10 ${scallops.slice(1).map((x) => `T ${x} 10`).join(" ")} T 0 10 Z`;
  return (
    <svg viewBox="0 0 1300 30" preserveAspectRatio="none" aria-hidden className={className}
      style={{ display: "block", width: "100%", height: 30, background: to }}>
      <path d={d} fill={from} />
    </svg>
  );
}
