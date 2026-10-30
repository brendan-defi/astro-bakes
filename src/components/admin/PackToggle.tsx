"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setPackedAction } from "@/app/admin/(app)/drops/[slug]/packing/actions";
import s from "@/app/admin/admin.module.css";

/**
 * One order's "packed" box on the pack list (PRD 4.6). It ticks at once and saves in the background, and goes back
 * with the reason if the save is refused. The page renders it keyed by the stored state, so after the refresh it
 * starts again from what's stored.
 */
export function PackToggle({ number, packed, disabled }: { number: string; packed: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(packed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    if (busy) return;
    setChecked(next);
    setBusy(true);
    setError(null);
    try {
      const r = await setPackedAction(number, next);
      if (!r.ok) {
        setChecked(!next);
        setError(r.error);
        return;
      }
      router.refresh();
    } catch {
      setChecked(!next);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const errorId = `pack-${number}-err`;
  return (
    <>
      <input
        type="checkbox"
        className={s.packBox}
        checked={checked}
        disabled={disabled || busy}
        onChange={(e) => void toggle(e.target.checked)}
        aria-label={`${number} packed`}
        aria-describedby={error ? errorId : undefined}
      />
      {error && <p id={errorId} role="alert" className={s.fieldError}>{error}</p>}
    </>
  );
}
