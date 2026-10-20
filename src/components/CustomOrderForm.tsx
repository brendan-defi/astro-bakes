"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { submitCustomOrderAction } from "@/app/[locale]/custom-orders/actions";
import { DETAILS_MAX, isShortNotice, NAME_MAX, OCCASIONS, PARTY_SIZES, validateCustomOrder, type CustomOrderField } from "@/lib/custom-order-rules";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { CheckIcon, WarningIcon } from "./icons";
import s from "./parties.module.css";

interface Values { name: string; email: string; eventDate: string; partySize: string; occasion: string; details: string; website: string }

/** The custom-orders form: one screen, checked with the same rules as the server, with an in-place thank-you. */
export function CustomOrderForm({ locale, initial, dateMin, dateMax }: { locale: Locale; initial: { name: string; email: string }; dateMin: string; dateMax: string }) {
  const t = getStrings(locale);
  const [v, setV] = useState<Values>({ ...initial, eventDate: "", partySize: "", occasion: "", details: "", website: "" });
  const [tried, setTried] = useState(false);
  const [serverFields, setServerFields] = useState<CustomOrderField[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState<{ name: string; email: string } | null>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);
  const set = (patch: Partial<Values>) => { setV((p) => ({ ...p, ...patch })); setServerFields([]); };

  const check = (x: Values) => { const r = validateCustomOrder(x); return r.ok ? [] : r.fields; };
  const bad = new Set<CustomOrderField>([...(tried ? check(v) : []), ...serverFields]);
  const errorText: Record<CustomOrderField, string> = { name: t.errName, email: t.errEmail, eventDate: t.errEventDate, partySize: t.errPartySize, details: t.errDetails };
  const ids: Record<CustomOrderField, string> = { name: "co-name", email: "co-email", eventDate: "co-date", partySize: "co-size", details: "co-details" };
  const invalid = (f: CustomOrderField) => (bad.has(f) ? { "aria-invalid": true as const, "aria-describedby": `${ids[f]}-err` } : {});
  // A valid date under two weeks out is allowed, with a warning that it may not work out.
  const shortNotice = !bad.has("eventDate") && /^\d{4}-\d{2}-\d{2}$/.test(v.eventDate) && v.eventDate >= dateMin && isShortNotice(v.eventDate);
  const error = (f: CustomOrderField) => bad.has(f) && <span id={`${ids[f]}-err`} className={s.err}><WarningIcon size={16} />{errorText[f]}</span>;

  useEffect(() => { if (sent) sentRef.current?.focus(); }, [sent]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setNotice(null);
    const fields = check(v);
    if (fields.length) {
      document.getElementById(ids[fields[0]])?.focus();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const r = await submitCustomOrderAction({ ...v, occasion: v.occasion || null, locale });
      if (r.ok) setSent({ name: v.name.trim(), email: v.email.trim() });
      else if (r.error === "rate_limited") setNotice(t.requestRateLimited);
      else setServerFields(r.fields);
    } catch {
      setNotice(t.partyRequestFailed);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className={s.sent} role="status">
        <span className={s.sentIcon}><CheckIcon size={28} strokeWidth={3} /></span>
        <h2 ref={sentRef} tabIndex={-1} className={`display ${s.sentTitle}`}>{t.requestSentTitle}</h2>
        <p className={s.sentBody}>{t.requestSentBody(sent.name, sent.email)}</p>
        <Link href={`/${locale}`} className="btn btn-secondary raised">{t.backToShop}</Link>
      </div>
    );
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <div className={s.row2}>
        <div className="field">
          <label htmlFor="co-name" className="label">{t.yourName}</label>
          <input id="co-name" type="text" autoComplete="name" required maxLength={NAME_MAX} className={`input ${bad.has("name") ? s.inputError : ""}`} value={v.name} onChange={(e) => set({ name: e.target.value })} {...invalid("name")} />
          {error("name")}
        </div>
        <div className="field">
          <label htmlFor="co-email" className="label">{t.emailAddress}</label>
          <input id="co-email" type="email" autoComplete="email" required placeholder="you@example.com" className={`input ${bad.has("email") ? s.inputError : ""}`} value={v.email} onChange={(e) => set({ email: e.target.value })} {...invalid("email")} />
          {error("email")}
        </div>
      </div>
      <div className={`field ${s.dateField}`}>
        <label htmlFor="co-date" className="label">{t.partyDate}</label>
        <input id="co-date" type="date" required min={dateMin} max={dateMax} className={`input ${bad.has("eventDate") ? s.inputError : ""}`} value={v.eventDate} onChange={(e) => set({ eventDate: e.target.value })}
          aria-describedby={[bad.has("eventDate") ? "co-date-err" : "co-date-hint", shortNotice ? "co-date-short" : ""].join(" ").trim()} aria-invalid={bad.has("eventDate") || undefined} />
        {bad.has("eventDate") ? error("eventDate") : <span id="co-date-hint" className="hint">{t.partyDateHint}</span>}
        {shortNotice && <span id="co-date-short" className={s.shortNotice}><WarningIcon size={16} />{t.shortNotice}</span>}
      </div>
      <fieldset className={s.fieldset} aria-describedby={bad.has("partySize") ? "co-size-err" : undefined}>
        <legend className="label">{t.partySizeLabel}</legend>
        <div className={s.options}>
          {PARTY_SIZES.map((k, i) => (
            <label key={k} className={s.option}>
              <input id={i === 0 ? "co-size" : undefined} type="radio" name="partySize" value={k} checked={v.partySize === k} onChange={() => set({ partySize: k })} />
              <span>{t.partySizes[k]}</span>
            </label>
          ))}
        </div>
        {error("partySize")}
      </fieldset>
      <fieldset className={s.fieldset}>
        <legend className="label">{t.occasionLabel} <span className="ja">{t.optional}</span></legend>
        <div className={s.options}>
          {OCCASIONS.map((k) => (
            <label key={k} className={s.option}>
              <input type="radio" name="occasion" value={k} checked={v.occasion === k} onChange={() => set({ occasion: k })} />
              <span>{t.occasions[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="co-details" className="label">{t.partyDetails}</label>
        <textarea id="co-details" rows={5} required maxLength={DETAILS_MAX} placeholder={t.partyDetailsPlaceholder} className={`input ${bad.has("details") ? s.inputError : ""}`} value={v.details} onChange={(e) => set({ details: e.target.value })} {...invalid("details")} />
        {error("details")}
      </div>
      {/* Honeypot: hidden from people and screen readers; bots that fill it get a quiet success. */}
      <div className={s.hp} aria-hidden="true">
        <label htmlFor="co-website">Website</label>
        <input id="co-website" type="text" tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => set({ website: e.target.value })} />
      </div>
      {notice && <div role="alert" className="note">{notice}</div>}
      <div className={s.sendRow}>
        <p className={s.notOrder}>{t.requestNotOrder}</p>
        <button type="submit" className={`btn btn-primary ${s.submit}`} disabled={busy}>{t.sendRequest}</button>
      </div>
    </form>
  );
}
