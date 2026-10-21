"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { requestAdminSignInAction, verifyAdminCodeAction } from "@/app/admin/auth/actions";
import { fmtCountdown } from "@/lib/format";
import { CODE_LENGTH } from "@/lib/sign-in-code";
import { CodeInput } from "../CodeInput";
import s from "@/app/admin/admin.module.css";

const LINK_ERRORS: Record<string, string> = {
  other_browser: "That link was opened in a different browser from the one that asked for it. Type the code from the email where you asked, or ask for a new one here.",
  expired: "That link has expired or was already used. Ask for a new one.",
  invalid: "That link doesn't work. Ask for a new one.",
  locked: "Too many wrong codes. Ask for a new one.",
};
const CODE_ERRORS = {
  invalid: "That code isn't right. Check the email and try again.",
  expired: "That code has expired. Ask for a new one.",
  locked: "Too many wrong codes. Ask for a new one.",
};
const RESEND_MS = 30_000;

/** Email → code, as on the shop (PRD 2.1, 5.4); the link in the email works too, in this browser. English only. */
export function AdminSignIn({ next, error }: { next: string; error: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [misses, setMisses] = useState(0);
  const [notice, setNotice] = useState<string | null>(error ? LINK_ERRORS[error] ?? LINK_ERRORS.invalid : null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  async function request() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await requestAdminSignInAction({ email: email.trim(), next });
      if (!r.ok) {
        setNotice(r.error === "rate_limited" ? "Too many requests. Wait ten minutes and try again." : "That doesn't look like an email address.");
        return;
      }
      setCode("");
      setSent(true);
      setResendAt(Date.now() + RESEND_MS);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await verifyAdminCodeAction({ email: email.trim(), code });
      if (!r.ok) {
        setNotice(CODE_ERRORS[r.error]);
        setMisses((n) => n + 1);
        setBusy(false);
        return;
      }
      setDone(true);
      router.replace(r.next);
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  const submit = (fn: () => Promise<void>) => (e: FormEvent) => {
    e.preventDefault();
    void fn();
  };
  const resendLeft = Math.max(0, resendAt - now);

  return (
    <main className={s.signInPage}>
      <div className={`card shadow-5 ${s.signInCard}`}>
        <div className={s.brand}>
          <span className={`logo-face ${s.logo}`}>Astro Bakes</span>
          <span className={s.tag}>Admin</span>
        </div>
        {!sent ? (
          <>
            <h1 className={`display ${s.signInTitle}`}>Sign in</h1>
            <p>We'll email you a code. Only the shop's admin account gets one.</p>
            {notice && <div role="alert" className="note">{notice}</div>}
            <form className={s.form} onSubmit={submit(request)}>
              <label htmlFor="admin-email" className="label">Email address</label>
              <input id="admin-email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button type="submit" className={`btn btn-primary ${s.btnSm}`} style={{ marginTop: 6, alignSelf: "flex-start" }} disabled={busy}>Email me a code</button>
            </form>
          </>
        ) : (
          <>
            <h1 className={`display ${s.signInTitle}`}>Check your email</h1>
            <p>If {email.trim()} is the admin account, a code is on its way. It works for 15 minutes.</p>
            {notice && <div role="alert" className="note">{notice}</div>}
            <form className={s.form} onSubmit={submit(verify)}>
              <label htmlFor="admin-code" className="label">6-digit code</label>
              <div className={s.codeRow}>
                <CodeInput id="admin-code" value={code} onChange={setCode} doneLabel="Signed in" checking={busy} done={done} misses={misses} />
                <button type="submit" className={`btn btn-primary ${s.btnSm}`} disabled={code.length !== CODE_LENGTH || busy}>Continue</button>
              </div>
            </form>
            <div className={s.row}>
              <button type="button" className={s.linkBtn} onClick={() => { setSent(false); setNotice(null); }}>Use a different email</button>
              <button type="button" className={s.linkBtn} disabled={resendLeft > 0 || busy} onClick={() => void request()}>
                {resendLeft > 0 ? `Resend in ${fmtCountdown(resendLeft)}` : "Resend"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
