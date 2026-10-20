"use client";

/** − qty + control. `fx` adds a visual flourish after each change (box cards opt in; the checkout stays calm). */
export function Stepper({ qty, max, onInc, onDec, size, labels, fx }: {
  qty: number; max: number; onInc: () => void; onDec: () => void; size?: "sm";
  labels: { inc: string; dec: string };
  fx?: { inc?: (button: HTMLButtonElement) => void; dec?: (button: HTMLButtonElement) => void };
}) {
  return (
    <div className={`stepper ${size === "sm" ? "sm" : ""}`}>
      <button type="button" aria-label={labels.dec} onClick={(e) => { onDec(); fx?.dec?.(e.currentTarget); }} disabled={qty <= 0}>−</button>
      <span aria-live="polite" className="qty">{qty}</span>
      <button type="button" className="inc" aria-label={labels.inc} onClick={(e) => { onInc(); fx?.inc?.(e.currentTarget); }} disabled={qty >= max}>+</button>
    </div>
  );
}
