"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { shipOrderAction } from "@/app/admin/(app)/orders/actions";
import { formatTracking, parseTracking, TRACKING_HELP, trackingUrl } from "@/lib/tracking";
import s from "@/app/admin/admin.module.css";

export interface OrderShippingProps {
  number: string;
  /** It can be marked shipped now: paid or packed, on a drop that has closed. */
  canShip: boolean;
  /** Why not, when it's only the drop holding it back. */
  blocked: string | null;
  shipped: boolean;
  /** Shipped and delivered (complete). */
  delivered?: boolean;
  /** Digits, as stored. */
  tracking: string | null;
  /** Where the shipping email goes. */
  email: string;
}

/**
 * Shipping one order (PRD 4.4, 4.6 manual fallback): add the Japan Post tracking number and mark it shipped, which
 * emails the customer the number and Japan Post's link. Once shipped, the number can be corrected.
 */
export function OrderShipping({ number, canShip, blocked, shipped, delivered = false, tracking, email }: OrderShippingProps) {
  const router = useRouter();
  const [correcting, setCorrecting] = useState(false);
  const [value, setValue] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reset = (open: boolean) => { setCorrecting(open); setValue(""); setNotify(true); setFieldError(null); setError(null); setDone(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!parseTracking(value)) { setFieldError(`Enter the tracking number: ${TRACKING_HELP.charAt(0).toLowerCase()}${TRACKING_HELP.slice(1)}`); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await shipOrderAction(number, { tracking: value, notify, correct: shipped });
      if (!r.ok) {
        if (r.field) setFieldError(r.error);
        else setError(r.error);
        return;
      }
      const mail = r.emailed === true ? `${email} has been emailed the tracking number.` : r.emailed === false ? "The email to the customer failed; the timeline has the error." : "The customer wasn't emailed.";
      reset(false);
      setDone(`${shipped ? "Tracking number corrected." : "Shipped."} ${mail}`);
      router.refresh();
    } catch {
      setError("Couldn't do that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form className={s.moneyForm} onSubmit={submit} noValidate aria-label={shipped ? "Correct the tracking number" : "Mark shipped"}>
      <div className="field">
        <label htmlFor="ship-tracking" className="label">{shipped ? "Correct tracking number" : "Tracking number"}</label>
        <input
          id="ship-tracking"
          className={`input ${s.trackingInput}`}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          disabled={busy}
          placeholder="1234-5678-9012"
          onChange={(e) => { setValue(e.target.value); setFieldError(null); setError(null); }}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "ship-tracking-err" : "ship-tracking-help"}
        />
        {fieldError ? <p id="ship-tracking-err" className={s.fieldError}>{fieldError}</p> : <p id="ship-tracking-help" className={s.help}>{TRACKING_HELP}</p>}
      </div>
      <label className={s.checkRow}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={busy} />
        {shipped ? `Email the customer the right number (${email})` : `Email the customer the tracking number (${email})`}
      </label>
      <div className={s.confirmActions}>
        <button type="submit" className={`btn btn-primary ${s.btnSm}`} disabled={busy}>{busy ? "Saving…" : shipped ? "Save the correction" : "Mark shipped"}</button>
        {shipped && <button type="button" className={s.linkBtn} disabled={busy} onClick={() => reset(false)}>Cancel</button>}
      </div>
    </form>
  );

  return (
    <div className={s.moneyActions}>
      {shipped && tracking && (
        <p className={s.trackingLine}>
          <span className={s.mono}>{formatTracking(tracking)}</span>{" "}
          <a href={trackingUrl(tracking, "en")} target="_blank" rel="noreferrer">Track on Japan Post ↗</a>
        </p>
      )}
      {shipped ? (
        correcting ? form : (
          <div className={s.lifecycleRow}>
            <button type="button" className={`btn btn-secondary ${s.btnSm}`} onClick={() => reset(true)}>Correct the tracking number…</button>
            <span className={s.help}>{delivered ? "Delivered." : "It shows as delivered when you press Mark complete on its drop, once the parcels have arrived."}</span>
          </div>
        )
      ) : canShip ? (
        form
      ) : (
        <p className={s.help}>{blocked ?? "Nothing to ship."}</p>
      )}
      {error && <p role="alert" className={s.statusError}>{error}</p>}
      {done && !error && <p role="status" className={s.statusOk}>{done}</p>}
    </div>
  );
}
