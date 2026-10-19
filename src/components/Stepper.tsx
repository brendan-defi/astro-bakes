"use client";

export function Stepper({ qty, max, onInc, onDec, size, labels }: {
  qty: number; max: number; onInc: () => void; onDec: () => void; size?: "sm";
  labels: { inc: string; dec: string };
}) {
  return (
    <div className={`stepper ${size === "sm" ? "sm" : ""}`}>
      <button type="button" aria-label={labels.dec} onClick={onDec} disabled={qty <= 0}>−</button>
      <span aria-live="polite" className="qty">{qty}</span>
      <button type="button" className="inc" aria-label={labels.inc} onClick={onInc} disabled={qty >= max}>+</button>
    </div>
  );
}
