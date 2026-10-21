"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeTimeSlotAction } from "@/app/[locale]/account/actions";
import type { Locale } from "@/lib/data";
import type { DeliverySlot } from "@/lib/delivery-slots";
import { getStrings } from "@/lib/i18n";
import { SlotOptions } from "../SlotOptions";
import a from "../account.module.css";

/** Change the delivery time slot from the order page while the drop is open (D21). Optimistic, reverted if the server says no. */
export function TimeSlotPicker({ locale, number, initial, legend }: { locale: Locale; number: string; initial: DeliverySlot; legend: string }) {
  const t = getStrings(locale);
  const router = useRouter();
  const [slot, setSlot] = useState<DeliverySlot>(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; alert: boolean } | null>(null);
  async function change(next: DeliverySlot) {
    if (next === slot) return;
    const previous = slot;
    setSlot(next);
    setBusy(true);
    setStatus(null);
    try {
      const r = await changeTimeSlotAction(number, next);
      if (r.ok) setStatus({ text: t.saved, alert: false });
      else if (r.error === "closed") {
        setSlot(previous);
        setStatus({ text: t.slotChangeClosed, alert: true });
        router.refresh(); // the page then shows the slot as fixed
      } else {
        setSlot(previous);
        setStatus({ text: t.saveFailed, alert: true });
      }
    } catch {
      setSlot(previous);
      setStatus({ text: t.saveFailed, alert: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <SlotOptions locale={locale} name={`slot-${number}`} legend={legend} value={slot} onChange={(v) => void change(v)} disabled={busy} />
      {status && <span className={a.status} role={status.alert ? "alert" : "status"}>{status.text}</span>}
    </div>
  );
}
