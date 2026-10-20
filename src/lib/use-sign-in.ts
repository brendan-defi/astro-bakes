"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestSignInAction, verifyCodeAction } from "@/app/[locale]/auth/actions";
import type { Locale } from "./data";
import { getStrings } from "./i18n";
import { motionOK } from "./motion";

/** Per-tab sign-in state, so a refresh of the "check your email" screen keeps the address and the resend timer. */
const KEY = "ab-auth-pending";
/** How long the code field's "you're in" moment plays before the page moves on (none under reduced motion). */
export const CELEBRATE_MS = 1100;

/**
 * How the "you're in" moment ended: it played out, the person went Back (which may keep this page, as in the checkout's
 * steps), or they followed a link (which takes them off it).
 */
type Ending = "played" | "back" | "link";

/**
 * Waits out the "you're in" moment, unless the person heads somewhere else themselves meanwhile: a plain click on a
 * link, or Back. The page is still mounted while that navigation loads, so without this the end of the moment would
 * send them to the sign-in destination instead. (A modified click opens another tab and leaves this one be.) Ways out
 * that a page offers itself, like the checkout's back buttons, call `cancel` instead.
 */
function celebrate(): Promise<Ending> {
  return new Promise((resolve) => {
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (link && link.target !== "_blank" && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) finish("link");
    };
    const onBack = () => finish("back");
    const timer = window.setTimeout(() => finish("played"), CELEBRATE_MS);
    function finish(ending: Ending) {
      window.clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onBack);
      resolve(ending);
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onBack);
  });
}

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
  /** The code was accepted. Stays set while the page moves on; a new code or "use a different email" clears it. */
  const [verified, setVerified] = useState(false);
  /** Codes turned down so far, so the field can shake once for each. */
  const [misses, setMisses] = useState(0);
  /**
   * Which flow is current. Starting over (a new code, "use a different email") or leaving the page moves it on, so a
   * code check still in flight, or the pause after one, can't act for a flow that's gone: no notice, no celebration,
   * and above all no navigation the person didn't ask for.
   */
  const flow = useRef(0);
  /**
   * Drops a code check or "you're in" moment under way, without moving on, and settles busy: for a page that stays put
   * while the person goes elsewhere on it (the checkout's back buttons, Back between its steps). Work already under way
   * for the dropped flow can't navigate afterwards, or clear the busy of whatever comes next.
   */
  const cancel = useCallback(() => {
    flow.current++;
    setBusy(false);
  }, []);
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
    return () => {
      window.clearInterval(id);
      flow.current++;
    };
  }, []);

  const request = useCallback(async (): Promise<boolean> => {
    const address = email.trim();
    if (!address || busy) return false;
    flow.current++;
    setVerified(false);
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
    const mine = flow.current;
    setBusy(true);
    setNotice(null);
    try {
      const r = await verifyCodeAction({ email, code });
      if (flow.current !== mine) return false;
      if (!r.ok) {
        setNotice(r.error === "locked" ? t.codeLocked : r.error === "expired" ? t.codeExpired : t.codeInvalid);
        setMisses((n) => n + 1);
        return false;
      }
      // Clear the stored address but leave `pending` set: the caller navigates away, and flipping it first would
      // let a "code screen without an address" guard fire in the render before the navigation lands.
      writePending(null);
      setVerified(true);
      // Stay busy while the field celebrates, so nothing can be sent twice. Someone who leaves meanwhile is already
      // signed in, and their navigation wins. Back may keep this page, so settle busy for whatever it shows next; a link
      // takes them off it, so stay busy while that loads rather than let the page react underneath.
      const ending = motionOK() ? await celebrate() : "played";
      if (ending === "back") cancel();
      else if (ending === "link") flow.current++;
      if (flow.current !== mine) return false;
      onSignedIn(r.next);
      return true;
    } finally {
      // A dropped flow was either cancelled (busy settled already, and something newer may be busy by now) or is on its
      // way off the page by a link, which should stay busy until it's gone.
      if (flow.current === mine) setBusy(false);
    }
  }, [email, code, busy, onSignedIn, cancel, t]);

  /** Back to the email field, dropping any code check (or celebration) still under way. */
  const reset = useCallback(() => {
    cancel();
    writePending(null);
    setPending(false);
    setCode("");
    setNotice(null);
    setVerified(false);
  }, [cancel]);

  return { email, setEmail, code, setCode, pending, hydrated, busy, notice, setNotice, verified, misses, resendLeft: Math.max(0, resendAt - now), request, verify, cancel, reset };
}
