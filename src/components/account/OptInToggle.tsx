"use client";

import { useState } from "react";
import { setMarketingOptInAction } from "@/app/[locale]/account/actions";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import a from "../account.module.css";

/** One toggle: "Email me when a drop is announced or opens" (PRD 2.4). Transactional email is not optional. */
export function OptInToggle({ locale, initial }: { locale: Locale; initial: boolean }) {
  const t = getStrings(locale);
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    setOn(next);
    setBusy(true);
    try {
      const r = await setMarketingOptInAction(next);
      if (!r.ok) setOn(!next);
    } finally { setBusy(false); }
  }
  return (
    <label className={a.toggle}>
      <input type="checkbox" checked={on} disabled={busy} onChange={(e) => void change(e.target.checked)} />
      <span className={a.toggleText}>
        <span className="w9">{t.optInLabel}</span>
        <span className="small w7">{t.optInConsent}</span>
      </span>
    </label>
  );
}
