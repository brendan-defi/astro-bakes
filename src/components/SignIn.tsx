"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { requestSignInAction, verifyCodeAction } from "@/app/[locale]/auth/actions";
import type { Locale } from "@/lib/data";
import { fmtCountdown } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import { ArrowLeftIcon, CheckIcon } from "./icons";
import { Logo } from "./Logo";
import s from "./checkout.module.css";

/** Standalone sign-in (PRD 2.2a): email → "check your email" with the code input; the link in the email works too. */
export function SignIn({ locale, next, error }: { locale: Locale; next: string; error: string | null }) {
  const t = getStrings(locale);
  const router = useRouter();
  const home = `/${locale}`;
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(error === "expired" ? t.linkExpired : error === "invalid" ? t.linkExpired : error === "locked" ? t.codeLocked : null);
  const [now, setNow] = useState(() => Date.now());
  const [resendAt, setResendAt] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const resendLeft = resendAt ? Math.max(0, resendAt - now) : 0;

  async function request(e?: FormEvent) {
    e?.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await requestSignInAction({ email, locale, next });
      if (!r.ok) { setNotice(r.error === "rate_limited" ? t.tooManyRequests : t.invalidEmail); return; }
      setSent(true);
      setCode("");
      setResendAt(Date.now() + 30_000);
    } finally { setBusy(false); }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await verifyCodeAction({ email, code });
      if (!r.ok) { setNotice(r.error === "locked" ? t.codeLocked : r.error === "expired" ? t.codeExpired : t.codeInvalid); return; }
      router.push(r.next);
      router.refresh();
    } finally { setBusy(false); }
  }

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
          {!sent ? (
            <div className={`stack ${s.narrow}`} style={{ gap: 16 }}>
              <h1 className={`display ${s.h1sm}`}>{t.signIn}</h1>
              <p className={s.lead}>{t.signInBody}</p>
              {notice && <div role="alert" className="note">{notice}</div>}
              <form className={s.form} onSubmit={request}>
                <label htmlFor="si-email" className="label">{t.emailAddress}</label>
                <input id="si-email" type="email" required autoComplete="email" placeholder="you@example.com" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button type="submit" className={`btn btn-primary ${s.selfStart}`} style={{ marginTop: 6 }} disabled={busy}>{t.emailMeCode}</button>
              </form>
            </div>
          ) : (
            <div className={`stack ${s.narrow}`} style={{ gap: 16 }}>
              <h1 className={`display ${s.h1sm}`}>{t.checkEmail}</h1>
              <p className={s.lead}>{t.sentTo(email)}</p>
              {notice && <div role="alert" className="note">{notice}</div>}
              <form className={s.form} onSubmit={verify}>
                <label htmlFor="si-code" className="label">{t.sixDigit}</label>
                <div className={s.codeRow}>
                  <input id="si-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className={`input ${s.codeInput}`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                  <button type="submit" className="btn btn-primary" disabled={code.length !== 6 || busy}>{t.continue}</button>
                </div>
              </form>
              <div className={s.resendRow}>
                <span>{t.didntGetIt}</span>
                <button type="button" className={s.resendBtn} disabled={resendLeft > 0 || busy} onClick={() => request()}>
                  {resendLeft > 0 ? t.resendIn(fmtCountdown(resendLeft)) : t.resend}
                </button>
              </div>
              <p className={s.expires}>{t.expires}</p>
              <button type="button" className="btn-text" onClick={() => { setSent(false); setNotice(null); }}><ArrowLeftIcon size={18} /> {t.useDifferentEmail}</button>
              <div className={s.inline}><CheckIcon />{t.linkWorksToo}</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
