"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { CheckIcon } from "./icons";
import s from "./home.module.css";

interface Props {
  locale: Locale;
  id: string;
  label: string;
  button: string;
  consent: string;
  /** "hero" = inline in the drop hero; "section" = the notify-me section at the bottom. */
  variant: "hero" | "section";
  /** Extra fine print next to the consent line (the LINE link in the hero). */
  extra?: ReactNode;
}

/** Email capture with an in-place success state (PRD 1.5). */
export function NotifyForm({ locale, id, label, button, consent, variant, extra }: Props) {
  const t = getStrings(locale);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const hero = variant === "hero";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    // TODO: POST /api/subscribe → Subscriber(email, locale, source=homepage, consented_at)
    setDone(email);
  }

  if (done) {
    return (
      <div className={s.notifyDone} role="status">
        <span className={s.ok}><CheckIcon strokeWidth={3} /></span>
        <div>
          <div className="w9">{t.notifyDone}</div>
          <div className="small w7">{t.notifyDoneSub(done)}</div>
        </div>
      </div>
    );
  }
  return (
    <form className={hero ? s.heroForm : s.notifyForm} onSubmit={submit}>
      <label htmlFor={id} className="label">{label}</label>
      <div className={hero ? s.heroFormRow : s.notifyRow}>
        <input id={id} type="email" required autoComplete="email" placeholder="you@example.com" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className={`btn btn-primary ${hero ? s.heroBtn : s.notifyBtn}`}>{button}</button>
      </div>
      {hero ? (
        <div className={s.heroFine}><span>{consent}</span>{extra}</div>
      ) : (
        <p className={s.consent}>{consent}</p>
      )}
    </form>
  );
}
