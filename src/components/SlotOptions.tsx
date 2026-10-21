"use client";

import type { Locale } from "@/lib/data";
import { DELIVERY_SLOTS, type DeliverySlot } from "@/lib/delivery-slots";
import { getStrings } from "@/lib/i18n";
import s from "./checkout.module.css";

/**
 * The delivery time-slot choice (D21): native radios styled as chips, used at checkout and on the order page.
 * `busy` only marks the group as saving (aria-busy); the radios stay enabled so keyboard focus isn't lost.
 */
export function SlotOptions({ locale, name, legend, value, onChange, busy = false }: {
  locale: Locale;
  name: string;
  legend: string;
  value: DeliverySlot;
  onChange: (slot: DeliverySlot) => void;
  busy?: boolean;
}) {
  const t = getStrings(locale);
  return (
    <fieldset className={s.slots} aria-busy={busy || undefined}>
      <legend className="label">{legend}</legend>
      <div className={s.slotGrid}>
        {DELIVERY_SLOTS.map((slot) => (
          <label key={slot} className={`${s.slotChip} ${value === slot ? s.slotOn : ""}`}>
            <input type="radio" name={name} value={slot} checked={value === slot} onChange={() => onChange(slot)} className="sr-only" />
            {t.deliverySlots[slot]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
