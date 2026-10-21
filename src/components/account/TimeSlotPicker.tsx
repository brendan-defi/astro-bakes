"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changeTimeSlotAction } from "@/app/[locale]/account/actions";
import type { Locale } from "@/lib/data";
import type { DeliverySlot } from "@/lib/delivery-slots";
import { getStrings } from "@/lib/i18n";
import { SlotOptions } from "../SlotOptions";
import a from "../account.module.css";

/**
 * Change the delivery time slot from the order page while the drop is open (D21). Each choice saves
 * straight away. The radios are never disabled while saving, so keyboard focus stays in the group and
 * arrow keys keep working; overlapping choices are queued and only the latest is sent. A failure puts
 * back the last value the server accepted.
 */
export function TimeSlotPicker({ locale, number, initial, legend }: { locale: Locale; number: string; initial: DeliverySlot; legend: string }) {
  const t = getStrings(locale);
  const router = useRouter();
  const [choice, setChoice] = useState<DeliverySlot>(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; alert: boolean } | null>(null);
  const saved = useRef<DeliverySlot>(initial); // what the server last confirmed
  const queued = useRef<DeliverySlot | null>(null); // the newest choice not yet sent
  const inFlight = useRef(false);

  // A refreshed server render with a different saved slot (changed elsewhere) wins, unless a save is
  // in flight. Our own successful save comes back as the same value, so its "Saved." stays.
  useEffect(() => {
    if (inFlight.current || initial === saved.current) return;
    saved.current = initial;
    setChoice(initial);
    setStatus(null);
  }, [initial]);

  async function change(next: DeliverySlot) {
    setChoice(next);
    setStatus(null);
    queued.current = next;
    if (inFlight.current) return; // the running save picks it up when it finishes
    inFlight.current = true;
    setBusy(true);
    try {
      let didSave = false;
      while (queued.current !== null) {
        const want = queued.current;
        queued.current = null;
        if (want === saved.current) continue;
        let r: Awaited<ReturnType<typeof changeTimeSlotAction>> | null = null;
        try { r = await changeTimeSlotAction(number, want); } catch {}
        if (r?.ok) { saved.current = want; didSave = true; continue; }
        queued.current = null;
        setChoice(saved.current);
        if (r && r.error === "closed") {
          setStatus({ text: t.slotChangeClosed, alert: true });
          router.refresh(); // the page then shows the slot as fixed
        } else {
          setStatus({ text: t.saveFailed, alert: true });
        }
        return;
      }
      if (didSave) setStatus({ text: t.saved, alert: false });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <SlotOptions locale={locale} name={`slot-${number}`} legend={legend} value={choice} onChange={(v) => void change(v)} busy={busy} />
      <span className={a.status} role={status?.alert ? "alert" : "status"}>{status?.text ?? ""}</span>
    </div>
  );
}
