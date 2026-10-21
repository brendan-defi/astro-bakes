"use client";

import { useRef, useState } from "react";
import { setMarketingOptInAction } from "@/app/[locale]/account/actions";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { burst } from "@/lib/particles";
import { OnListStatus } from "./OnListStatus";
import s from "./home.module.css";

/**
 * A signed-in customer who doesn't get drop emails: one tap turns them on (PRD 1.5, 2.4). No email field,
 * since we know who they are. The same preference as the account page toggle.
 */
export function OptInButton({ locale, label, consent, doneText, variant }: { locale: Locale; label: string; consent: string; doneText: string; variant: "hero" | "section" }) {
  const t = getStrings(locale);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  async function optIn() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await setMarketingOptInAction(true);
      if (!r.ok) { setError(t.saveFailed); return; }
      burst(buttonRef.current, { kind: ["star", "heart", "sprinkle"], count: 14, power: 420 });
      setDone(true);
    } catch {
      setError(t.saveFailed);
    } finally {
      setBusy(false);
    }
  }
  if (done) return <OnListStatus locale={locale} text={doneText} />;
  return (
    <div className={variant === "hero" ? s.optInHero : s.optInSection}>
      <button ref={buttonRef} type="button" onClick={() => void optIn()} disabled={busy} aria-busy={busy || undefined} className={`btn btn-primary ${variant === "hero" ? `sheen ${s.heroBtn}` : s.notifyBtn}`}>{label}</button>
      <p className="small w7">{consent}</p>
      {error && <p className="small w9" role="alert">{error}</p>}
    </div>
  );
}
