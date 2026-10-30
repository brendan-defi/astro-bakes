"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { cancelOrderAction, refundOrderAction } from "@/app/admin/(app)/orders/actions";
import { NOTE_MAX, REFUND_REASON_LABEL, REFUND_REASONS, validateRefund, type RefundErrors } from "@/lib/order-admin-rules";
import s from "@/app/admin/admin.module.css";

export interface OrderMoneyActionsProps {
  number: string;
  /** The shop can cancel it now (paid, not shipped). */
  canCancel: boolean;
  /** What's left to refund. */
  refundable: number;
  /** What the page shows as refunded already; the server refuses a refund if that has changed meanwhile. */
  refunded: number;
  /** The drop is open, so a cancelled order's boxes go back on sale. */
  dropOpen: boolean;
  /** Where the cancellation email goes. */
  email: string;
}

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;
const OWED = "Stripe isn't connected yet, so refunds are recorded as owed and no money moves.";

/**
 * The order's money actions (PRD 4.4): cancel & refund while it hasn't shipped, and a refund without cancelling (all
 * or part of what's left, for damage, non-delivery or anything else). Each opens a confirmation with what it will do.
 */
export function OrderMoneyActions({ number, canCancel, refundable, refunded, dropOpen, email }: OrderMoneyActionsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"cancel" | "refund" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<RefundErrors>({});

  const open = (m: "cancel" | "refund") => {
    setMode(m);
    setError(null);
    setDone(null);
    setErrors({});
    setNote("");
    setNotify(true);
    setAmount("");
    setReason("");
  };
  const close = () => { setMode(null); setError(null); setErrors({}); };

  async function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error?: string; errors?: RefundErrors }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await action();
      if (!r.ok) {
        setErrors(r.errors ?? {});
        setError(r.error ?? null);
        return;
      }
      setMode(null);
      setDone(r.message);
      router.refresh();
    } catch {
      setError("Couldn't do that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function cancel(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const r = await cancelOrderAction(number, { note, notify });
      if (!r.ok) return r;
      const refund = r.refund ? `A refund of ${yen(r.refund)} is recorded as owed.` : "";
      const mail = r.emailed === true ? `${email} has been emailed.` : r.emailed === false ? "The email to the customer failed; the timeline has the error." : "The customer wasn't emailed.";
      return { ok: true, message: `Cancelled. ${refund} ${mail}`.replace(/\s+/g, " ") };
    });
  }

  function refund(e: FormEvent) {
    e.preventDefault();
    const v = validateRefund({ amount, reason, note }, refundable);
    if (!v.ok) { setErrors(v.errors); return; }
    void run(async () => {
      const r = await refundOrderAction(number, { amount, reason, note }, refunded);
      return r.ok ? { ok: true, message: `A refund of ${yen(r.amount)} is recorded as owed.` } : r;
    });
  }

  const fieldProps = (key: keyof RefundErrors, id: string) => ({ id, "aria-invalid": errors[key] ? true : undefined, "aria-describedby": errors[key] ? `${id}-err` : undefined });
  const fieldError = (key: keyof RefundErrors, id: string) => errors[key] && <p id={`${id}-err`} className={s.fieldError}>{errors[key]}</p>;
  const parsed = validateRefund({ amount, reason: "damage" }, refundable);

  return (
    <div className={s.moneyActions}>
      {mode === "cancel" ? (
        <form className={s.moneyForm} onSubmit={cancel} aria-labelledby="cancel-q" noValidate>
          <p id="cancel-q" className={s.confirmText}>
            <strong>Cancel {number}{refundable ? ` and refund ${yen(refundable)}` : ""}?</strong>{" "}
            {refundable ? "That's what's left of the payment. " : "It has been refunded in full already. "}
            {dropOpen ? "Its boxes go back on sale, since the drop is open." : "The drop has closed, so its boxes aren't sold again unless you reopen it."}
          </p>
          <label className={s.checkRow}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={busy} />
            Email the customer ({email})
          </label>
          <div className="field">
            <label htmlFor="cancel-note" className="label">Why (internal, optional)</label>
            <textarea id="cancel-note" className="input" rows={2} value={note} maxLength={NOTE_MAX + 100} disabled={busy} onChange={(e) => { setNote(e.target.value); setError(null); }} />
          </div>
          <div className={s.confirmActions}>
            <button type="submit" className={`btn btn-primary ${s.btnSm}`} disabled={busy}>{busy ? "Cancelling…" : "Yes, cancel the order"}</button>
            <button type="button" className={s.linkBtn} disabled={busy} onClick={close}>Keep the order</button>
          </div>
          {refundable > 0 && <p className={s.help}>{OWED}</p>}
        </form>
      ) : mode === "refund" ? (
        <form className={s.moneyForm} onSubmit={refund} aria-labelledby="refund-q" noValidate>
          <p id="refund-q" className={s.confirmText}>
            <strong>Refund without cancelling.</strong> Up to {yen(refundable)}. The order and its boxes stay as they are, and the customer isn&apos;t emailed.
          </p>
          <div className={s.moneyRow}>
            <div className="field">
              <label htmlFor="refund-amount" className="label">Amount (¥)</label>
              <input {...fieldProps("amount", "refund-amount")} className="input" inputMode="numeric" autoComplete="off" value={amount} disabled={busy} onChange={(e) => { setAmount(e.target.value); setErrors((x) => ({ ...x, amount: undefined })); setError(null); }} />
              {fieldError("amount", "refund-amount")}
            </div>
            <div className="field">
              <label htmlFor="refund-reason" className="label">Reason</label>
              <select {...fieldProps("reason", "refund-reason")} className="input" value={reason} disabled={busy} onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: undefined, note: undefined })); setError(null); }}>
                <option value="">Choose…</option>
                {REFUND_REASONS.map((r) => <option key={r} value={r}>{REFUND_REASON_LABEL[r]}</option>)}
              </select>
              {fieldError("reason", "refund-reason")}
            </div>
          </div>
          <div className="field">
            <label htmlFor="refund-note" className="label">Note (internal{reason === "other" ? "" : ", optional"})</label>
            <textarea {...fieldProps("note", "refund-note")} className="input" rows={2} value={note} maxLength={NOTE_MAX + 100} disabled={busy} onChange={(e) => { setNote(e.target.value); setErrors((x) => ({ ...x, note: undefined })); setError(null); }} />
            {fieldError("note", "refund-note")}
          </div>
          <div className={s.confirmActions}>
            <button type="submit" className={`btn btn-primary ${s.btnSm}`} disabled={busy}>{busy ? "Recording…" : parsed.ok ? `Record a refund of ${yen(parsed.value.amount)}` : "Record the refund"}</button>
            <button type="button" className={s.linkBtn} disabled={busy} onClick={close}>Cancel</button>
          </div>
          <p className={s.help}>{OWED}</p>
        </form>
      ) : (
        <div className={s.lifecycleRow}>
          {canCancel && <button type="button" className={`btn btn-secondary ${s.btnSm}`} onClick={() => open("cancel")}>Cancel &amp; refund…</button>}
          {refundable > 0 && <button type="button" className={`btn btn-secondary ${s.btnSm}`} onClick={() => open("refund")}>Refund…</button>}
          <span className={s.help}>
            {!canCancel && !refundable ? "Nothing left to cancel or refund." : refundable ? `${yen(refundable)} left to refund. ${OWED}` : "It has been refunded in full; cancelling won't refund anything more."}
          </span>
        </div>
      )}
      {error && <p role="alert" className={s.statusError}>{error}</p>}
      {done && !error && <p role="status" className={s.statusOk}>{done}</p>}
    </div>
  );
}
