"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelOrderAction } from "@/app/[locale]/account/actions";
import { addToSavedCart, type Quantities } from "@/lib/cart";
import type { Box, Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import a from "../account.module.css";

/** Cancel while the drop is open (D22): one confirmation, then the server does the rest. */
export function CancelOrderButton({ locale, number }: { locale: Locale; number: string }) {
  const t = getStrings(locale);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function cancel() {
    setBusy(true);
    setNotice(null);
    try {
      const r = await cancelOrderAction(number);
      if (!r.ok) {
        setNotice(r.error === "closed" ? t.cancelClosed : t.orderFailedGeneric);
        setConfirming(false);
      }
      // Success or not, the page re-reads the order so what's shown is what the server has.
      router.refresh();
    } catch {
      // The request itself failed: the outcome is unknown, so show the server's view of the order.
      setNotice(t.requestFailed);
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  if (!confirming) {
    return (
      <div className={a.actions}>
        <button type="button" className={`btn btn-secondary raised ${a.danger}`} onClick={() => setConfirming(true)}>{t.cancelOrder}</button>
        {notice && <span className={a.status} role="alert">{notice}</span>}
      </div>
    );
  }
  return (
    <div className={a.card}>
      <div className="w9">{t.cancelConfirmTitle}</div>
      <p className="small w7">{t.cancelConfirmBody}</p>
      <div className={a.actions}>
        <button type="button" className={`btn btn-secondary raised ${a.danger}`} disabled={busy} onClick={() => void cancel()}>{t.cancelConfirmYes}</button>
        <button type="button" className="btn-text" disabled={busy} onClick={() => setConfirming(false)}>{t.keepOrder}</button>
      </div>
    </div>
  );
}

/** "Order again": adds the same boxes to the cart for the open drop, keeping what's already there, then goes to the checkout (PRD 2.5). */
export function ReorderButton({ locale, dropId, items, boxes }: { locale: Locale; dropId: string; items: Quantities; boxes: Box[] }) {
  const t = getStrings(locale);
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        addToSavedCart(dropId, items, boxes);
        router.push(`/${locale}/checkout`);
      }}
    >
      {t.orderAgain}
    </button>
  );
}
