"use client";

import { useCallback, useEffect, useState } from "react";
import { requestSignInAction, verifyCodeAction } from "@/app/[locale]/auth/actions";
import type { Locale } from "./data";
import { getStrings } from "./i18n";

/** Per-tab sign-in state, so a refresh of the "check your email" screen keeps the address and the resend timer. */
const KEY = "ab-auth-pending";

interface Pending {
  email: string;
  resendAt: number;
}

function readPending(): Pending | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Pending>) : null;
    return p && typeof p.email === "string" && p.email ? { email: p.email, resendAt: Number(p.resendAt) || 0 } : null;
  } catch {
    return null;
  }
}
function writePending(p: Pending | null) {
  try {
    if (p) window.sessionStorage.setItem(KEY, JSON.stringify(p));
    else window.sessionStorage.removeItem(KEY);
  } catch {}
}

/**
 * The request → "check your email" → code flow shared by the sign-in page and
 * the checkout (PRD 2.1). `next` is computed at request time so the magic link
 * returns to the right place; `onSignedIn` runs after the code is accepted.
 */
export function useSignInFlow({ locale, next, onSignedIn }: { locale: Locale; next: () => string; onSignedIn: (next: string) => void }) {
  const t = getStrings(locale);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  /** An email has been sent for `email` from this tab. */
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resendAt, setResendAt] = useState(0);

  useEffect(() => {
    const p = readPending();
    if (p) {
      setEmail(p.email);
      setResendAt(p.resendAt);
      setPending(true);
    }
    setHydrated(true);
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const request = useCallback(async (): Promise<boolean> => {
    const address = email.trim();
    if (!address || busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      const r = await requestSignInAction({ email: address, locale, next: next() });
      if (!r.ok) {
        setNotice(r.error === "rate_limited" ? t.tooManyRequests : t.invalidEmail);
        return false;
      }
      const at = Date.now() + 30_000;
      writePending({ email: address, resendAt: at });
      setResendAt(at);
      setCode("");
      setPending(true);
      return true;
    } finally {
      setBusy(false);
    }
  }, [email, busy, locale, next, t]);

  const verify = useCallback(async (): Promise<boolean> => {
    if (code.length !== 6 || busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      const r = await verifyCodeAction({ email, code });
      if (!r.ok) {
        setNotice(r.error === "locked" ? t.codeLocked : r.error === "expired" ? t.codeExpired : t.codeInvalid);
        return false;
      }
      // Clear the stored address but leave `pending` set: the caller navigates away, and flipping it first would
      // let a "code screen without an address" guard fire in the render before the navigation lands.
      writePending(null);
      onSignedIn(r.next);
      return true;
    } finally {
      setBusy(false);
    }
  }, [email, code, busy, onSignedIn, t]);

  /** Back to the email field. */
  const reset = useCallback(() => {
    writePending(null);
    setPending(false);
    setCode("");
    setNotice(null);
  }, []);

  return { email, setEmail, code, setCode, pending, hydrated, busy, notice, setNotice, resendLeft: Math.max(0, resendAt - now), request, verify, reset };
}
