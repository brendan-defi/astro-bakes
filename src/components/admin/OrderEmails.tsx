"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resendOrderEmailAction } from "@/app/admin/(app)/orders/actions";
import s from "@/app/admin/admin.module.css";

type Kind = "confirmation" | "shipped";
const LABEL: Record<Kind, string> = { confirmation: "the order confirmation", shipped: "the shipping email" };

/**
 * Send the order confirmation or the shipping email again (PRD 4.4), with the order as it is now. Each asks first,
 * since every click is another email in the customer's inbox.
 */
export function OrderEmails({ number, email, confirmation, shipped }: { number: string; email: string; confirmation: boolean; shipped: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send(kind: Kind) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await resendOrderEmailAction(number, kind);
      if (!r.ok) { setError(r.error); return; }
      setAsking(null);
      if (r.emailed) setDone(`Sent ${LABEL[kind]} to ${email} again.`);
      else setError("The email failed; the timeline has the error.");
      router.refresh();
    } catch {
      setError("Couldn't do that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirmation && !shipped) return <p className={s.help}>Nothing to send: it hasn&apos;t been paid, or it was cancelled.</p>;
  return (
    <div className={s.moneyActions}>
      {asking ? (
        <div className={s.confirmBox} role="group" aria-labelledby="resend-q">
          <p id="resend-q" className={s.confirmText}><strong>Send {LABEL[asking]} to {email} again?</strong> It shows the order as it is now.</p>
          <div className={s.confirmActions}>
            <button type="button" className={`btn btn-primary ${s.btnSm}`} disabled={busy} onClick={() => void send(asking)}>{busy ? "Sending…" : "Yes, send it"}</button>
            <button type="button" className={s.linkBtn} disabled={busy} onClick={() => { setAsking(null); setError(null); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className={s.lifecycleRow}>
          {confirmation && <button type="button" className={`btn btn-secondary ${s.btnSm}`} onClick={() => { setAsking("confirmation"); setDone(null); setError(null); }}>Resend confirmation…</button>}
          {shipped && <button type="button" className={`btn btn-secondary ${s.btnSm}`} onClick={() => { setAsking("shipped"); setDone(null); setError(null); }}>Resend shipping email…</button>}
        </div>
      )}
      {error && <p role="alert" className={s.statusError}>{error}</p>}
      {done && !error && <p role="status" className={s.statusOk}>{done}</p>}
    </div>
  );
}
