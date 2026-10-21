"use client";

import { useEffect, useId, useRef, useState } from "react";
import { setMarketingOptInAction } from "@/app/[locale]/account/actions";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { burst } from "@/lib/particles";
import { OnListStatus } from "./OnListStatus";
import s from "./home.module.css";

/**
 * A signed-in customer's drop emails on the homepage (PRD 1.5, 2.4): a status with a link to the account
 * page's toggle when they're on the list, or a one-tap opt-in when they aren't. Never an email field,
 * since we know who they are. One component owns both states, so the refreshed server render after an
 * opt-in updates it in place rather than swapping in a new element: the live region below keeps its
 * announcement and focus lands on the settings link instead of falling back to the page.
 */
export function SignedInDropEmails({ locale, optedIn, statusText, label, consent, variant }: {
  locale: Locale;
  optedIn: boolean;
  statusText: string;
  label: string;
  consent: string;
  variant: "hero" | "section";
}) {
  const t = getStrings(locale);
  const [on, setOn] = useState(optedIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const focusLink = useRef(false);
  const linkId = useId();

  // The server's value wins when it changes (switched off on the account page, then this page refreshed),
  // except while our own request is still out.
  useEffect(() => {
    if (!inFlight.current) setOn(optedIn);
  }, [optedIn]);

  useEffect(() => {
    if (on && focusLink.current) {
      focusLink.current = false;
      document.getElementById(linkId)?.focus();
    }
  }, [on, linkId]);

  async function optIn() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await setMarketingOptInAction(true);
      if (!r.ok) { setError(t.saveFailed); return; }
      burst(buttonRef.current, { kind: ["star", "heart", "sprinkle"], count: 14, power: 420 });
      focusLink.current = true;
      setAnnouncement(statusText);
      setOn(true);
    } catch {
      setError(t.saveFailed);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      {on ? (
        <OnListStatus locale={locale} text={statusText} linkId={linkId} />
      ) : (
        <div className={variant === "hero" ? s.optInHero : s.optInSection}>
          <button ref={buttonRef} type="button" onClick={() => void optIn()} disabled={busy} aria-busy={busy || undefined} className={`btn btn-primary ${variant === "hero" ? `sheen ${s.heroBtn}` : s.notifyBtn}`}>{label}</button>
          <p className="small w7">{consent}</p>
          {error && <p className="small w9" role="alert">{error}</p>}
        </div>
      )}
      {/* Always mounted, so a change to its text is announced. Empty until this visit's own opt-in succeeds. */}
      <span className="sr-only" role="status">{announcement}</span>
    </>
  );
}
