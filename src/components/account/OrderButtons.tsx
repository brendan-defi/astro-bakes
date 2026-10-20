"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelOrderAction } from "@/app/[locale]/account/actions";
import { storageKey } from "@/lib/cart";
import type { Locale } from "@/lib/data";
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
      if (!r.ok) { setNotice(r.error === "closed" ? t.cancelClosed : t.orderFailedGeneric); setConfirming(false); return; }
      router.refresh();
    } finally { setBusy(false); }
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

/** "Order again": puts the same boxes in the cart for the open drop and goes to the checkout (PRD 2.5). */
export function ReorderButton({ locale, dropId, items }: { locale: Locale; dropId: string; items: Record<string, number> }) {
  const t = getStrings(locale);
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        try { window.localStorage.setItem(storageKey(dropId), JSON.stringify(items)); } catch {}
        router.push(`/${locale}/checkout`);
      }}
    >
      {t.orderAgain}
    </button>
  );
}
