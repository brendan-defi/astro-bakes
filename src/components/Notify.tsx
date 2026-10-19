"use client";

import { useState, type FormEvent } from "react";
import { settings, type Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { CheckIcon } from "./icons";
import s from "./home.module.css";

export function Notify({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    // TODO: POST /api/subscribe → Subscriber(email, locale, source=homepage, consented_at)
    setDone(email);
  }

  return (
    <section id="notify" className={s.notify}>
      <div className={`container ${s.notifyInner}`}>
        <div className={s.notifyText}>
          <h2 className="display h2">{t.notifyTitle}</h2>
          <p className={s.notifySub}>{t.notifySub}</p>
          {done ? (
            <div className={s.notifyDone} role="status">
              <span className={s.ok}><CheckIcon strokeWidth={3} /></span>
              <div>
                <div className="w9">{t.notifyDone}</div>
                <div className="small w7">{t.notifyDoneSub(done)}</div>
              </div>
            </div>
          ) : (
            <form className={s.notifyForm} onSubmit={submit}>
              <label htmlFor="notify-email" className="label">{t.emailAddress}</label>
              <div className={s.notifyRow}>
                <input id="notify-email" type="email" required placeholder="you@example.com" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button type="submit" className={`btn btn-primary ${s.notifyBtn}`}>{t.notifyCta}</button>
              </div>
              <p className={s.consent}>{t.notifyConsent}</p>
            </form>
          )}
        </div>
        <div className={s.lineCard}>
          <div className={s.lineQr}>{t.lineQr}</div>
          <div className={s.lineBody}>
            <div className={s.lineTitle}>{t.orLine}</div>
            <p className={s.lineSub}>{t.lineSub}</p>
            <a href={settings.lineUrl} className={s.lineBtn}>{t.addFriendLine}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
