"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { updateDeliveryAction } from "@/app/admin/(app)/orders/actions";
import { DELIVERY_SLOTS } from "@/lib/delivery-slots";
import { getStrings } from "@/lib/i18n";
import type { DeliveryEdit, DeliveryErrors } from "@/lib/order-admin-rules";
import { lookupPostal, normalisePostal, outsideWards } from "@/lib/postal";
import s from "@/app/admin/admin.module.css";

const en = getStrings("en");
const FIELDS: { key: keyof DeliveryEdit; label: string; help?: string }[] = [
  { key: "name", label: "Recipient" },
  { key: "phone", label: "Phone" },
  { key: "postal", label: "Postal code" },
  { key: "line1", label: "Street address", help: "Block, building number: the part after the town." },
  { key: "line2", label: "Building and room (optional)" },
];

/** What a postal code resolves to as it's typed, under the field. */
function area(postal: string): string | null {
  const p = normalisePostal(postal);
  if (p.length !== 7) return null;
  const hit = lookupPostal(p);
  if (hit) return `${hit.prefecture}${hit.city}${hit.town} (${hit.wardEn})`;
  return outsideWards(p) ? "Outside the 23 wards: we don't deliver there." : "No such postal code in the 23 wards.";
}

/**
 * Edit an order's recipient, phone, address and time slot until it ships (PRD 4.4), with the checkout's own rules.
 * `version` is what the form started from; the save is refused if the details changed meanwhile.
 */
export function OrderDeliveryEdit({ number, initial, version }: { number: string; initial: DeliveryEdit; version: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DeliveryEdit>(initial);
  const [errors, setErrors] = useState<DeliveryErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const start = () => { setDraft(initial); setErrors({}); setError(null); setDone(null); setOpen(true); };
  const set = (key: keyof DeliveryEdit, v: string) => { setDraft((d) => ({ ...d, [key]: v })); setErrors(({ [key]: _gone, ...rest }) => rest); setError(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await updateDeliveryAction(number, { ...draft }, version);
      if (!r.ok) {
        setErrors(r.errors ?? {});
        setError(r.error ?? (r.errors ? "Some fields need fixing; they're marked above." : null));
        return;
      }
      setOpen(false);
      setDone(r.changed ? "Saved. The customer isn't emailed; send the confirmation again if they should have the new details." : "Nothing changed.");
      router.refresh();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const resolved = area(draft.postal);
  const props = (key: keyof DeliveryEdit) => ({
    id: `delivery-${key}`,
    className: "input",
    value: draft[key],
    disabled: busy,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": [errors[key] && `delivery-${key}-err`, key === "postal" && resolved && "delivery-postal-area", FIELDS.find((f) => f.key === key)?.help && `delivery-${key}-help`].filter(Boolean).join(" ") || undefined,
  });

  if (!open) {
    return (
      <div className={s.deliveryEdit}>
        <button type="button" className={`btn btn-secondary ${s.btnSm}`} onClick={start}>Edit delivery details…</button>
        {done && <p role="status" className={s.statusOk}>{done}</p>}
      </div>
    );
  }
  return (
    <form className={`${s.moneyForm} ${s.deliveryEdit}`} onSubmit={submit} noValidate aria-label="Edit delivery details">
      {FIELDS.map(({ key, label, help }) => (
        <div key={key} className="field">
          <label htmlFor={`delivery-${key}`} className="label">{label}</label>
          <input {...props(key)} onChange={(e) => set(key, e.target.value)} {...(key === "phone" || key === "postal" ? { inputMode: "tel" as const } : {})} autoComplete="off" />
          {key === "postal" && resolved && <p id="delivery-postal-area" className={s.help}>{resolved}</p>}
          {help && <p id={`delivery-${key}-help`} className={s.help}>{help}</p>}
          {errors[key] && <p id={`delivery-${key}-err`} className={s.fieldError}>{errors[key]}</p>}
        </div>
      ))}
      <div className="field">
        <label htmlFor="delivery-slot" className="label">Time slot</label>
        <select {...props("slot")} onChange={(e) => set("slot", e.target.value)}>
          {DELIVERY_SLOTS.map((v) => <option key={v} value={v}>{en.deliverySlots[v]}</option>)}
        </select>
        {errors.slot && <p id="delivery-slot-err" className={s.fieldError}>{errors.slot}</p>}
      </div>
      <div className={s.confirmActions}>
        <button type="submit" className={`btn btn-primary ${s.btnSm}`} disabled={busy}>{busy ? "Saving…" : "Save delivery details"}</button>
        <button type="button" className={s.linkBtn} disabled={busy} onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
      </div>
      <p className={s.help}>Only this order changes, not the customer&apos;s saved address. They aren&apos;t emailed.</p>
      {error && <p role="alert" className={s.statusError}>{error}</p>}
    </form>
  );
}
