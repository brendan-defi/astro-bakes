"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { subscribeAction } from "@/app/[locale]/actions";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { burst } from "@/lib/particles";
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
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hero = variant === "hero";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Success is shown only once the signup is stored (PRD 1.5): Subscriber(email, locale, source=homepage, consented_at).
      const r = await subscribeAction({ email, locale, website });
      if (!r.ok) { setError(r.error === "invalid" ? t.notifyInvalid : r.error === "rate_limited" ? t.notifyRateLimited : t.notifyFailed); return; }
      // Fire from the button before the success state replaces it.
      burst(buttonRef.current, { kind: ["star", "heart", "sprinkle"], count: 14, power: 420 });
      setDone(email.trim());
    } catch {
      setError(t.notifyFailed);
    } finally {
      setBusy(false);
    }
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
        <input id={id} type="email" required autoComplete="email" placeholder="you@example.com" className="input" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error === t.notifyInvalid || undefined} />
        <button ref={buttonRef} type="submit" disabled={busy} aria-busy={busy || undefined} className={`btn btn-primary ${hero ? `sheen ${s.heroBtn}` : s.notifyBtn}`}>{button}</button>
      </div>
      {/* Honeypot: hidden from people and screen readers; bots that fill it get a quiet success. */}
      <div className={s.hp} aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {error && <p className={`small w9 ${s.notifyError}`} role="alert">{error}</p>}
      {hero ? (
        <div className={s.heroFine}><span>{consent}</span>{extra}</div>
      ) : (
        <p className={s.consent}>{consent}</p>
      )}
    </form>
  );
}
