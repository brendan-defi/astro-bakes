"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/data";
import { fmtCountdown } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import { useSignInFlow } from "@/lib/use-sign-in";
import { CodeInput } from "./CodeInput";
import { ArrowLeftIcon, CheckIcon } from "./icons";
import { Logo } from "./Logo";
import s from "./checkout.module.css";

/** Standalone sign-in (PRD 2.2a): email → "check your email" with the code input; the link in the email works too. */
export function SignIn({ locale, next, error }: { locale: Locale; next: string; error: string | null }) {
  const t = getStrings(locale);
  const router = useRouter();
  const home = `/${locale}`;
  const [urlNotice] = useState<string | null>(error === "locked" ? t.codeLocked : error ? t.linkExpired : null);
  const auth = useSignInFlow({
    locale,
    next: () => next,
    onSignedIn: (to) => {
      router.push(to);
      router.refresh();
    },
  });
  const notice = auth.notice ?? (auth.pending ? null : urlNotice);
  const submit = (fn: () => Promise<boolean>) => (e: FormEvent) => {
    e.preventDefault();
    void fn();
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={`container ${s.headerRow}`}>
          <Link href={home} aria-label={t.backToShop} className={s.iconBtn}><ArrowLeftIcon /></Link>
          <Logo href={home} label={t.home} size="sm" />
          <span className={s.spacer} />
        </div>
      </header>
      <div className={s.body}>
        <main className={s.main}>
          {!auth.pending ? (
            <div className={`stack ${s.narrow}`} style={{ gap: 16 }}>
              <h1 className={`display ${s.h1sm}`}>{t.signIn}</h1>
              <p className={s.lead}>{t.signInBody}</p>
              {notice && <div role="alert" className="note">{notice}</div>}
              <form className={s.form} onSubmit={submit(auth.request)}>
                <label htmlFor="si-email" className="label">{t.emailAddress}</label>
                <input id="si-email" type="email" required autoComplete="email" placeholder="you@example.com" className="input" value={auth.email} onChange={(e) => auth.setEmail(e.target.value)} />
                <button type="submit" className={`btn btn-primary ${s.selfStart}`} style={{ marginTop: 6 }} disabled={auth.busy}>{t.emailMeCode}</button>
              </form>
            </div>
          ) : (
            <div className={`stack ${s.narrow}`} style={{ gap: 16 }}>
              <h1 className={`display ${s.h1sm}`}>{t.checkEmail}</h1>
              <p className={s.lead}>{t.sentTo(auth.email)}</p>
              {notice && <div role="alert" className="note">{notice}</div>}
              <form className={s.form} onSubmit={submit(auth.verify)}>
                <label htmlFor="si-code" className="label">{t.sixDigit}</label>
                <div className={s.codeRow}>
                  <CodeInput id="si-code" value={auth.code} onChange={auth.setCode} />
                  <button type="submit" className="btn btn-primary" disabled={auth.code.length !== 6 || auth.busy}>{t.continue}</button>
                </div>
              </form>
              <div className={s.resendRow}>
                <span>{t.didntGetIt}</span>
                <button type="button" className={s.resendBtn} disabled={auth.resendLeft > 0 || auth.busy} onClick={() => void auth.request()}>
                  {auth.resendLeft > 0 ? t.resendIn(fmtCountdown(auth.resendLeft)) : t.resend}
                </button>
              </div>
              <p className={s.expires}>{t.expires}</p>
              <button type="button" className="btn-text" onClick={auth.reset}><ArrowLeftIcon size={18} /> {t.useDifferentEmail}</button>
              <div className={s.inline}><CheckIcon />{t.linkWorksToo}</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
