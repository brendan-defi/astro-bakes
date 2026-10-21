"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/[locale]/account/actions";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { cleanPhoneInput, normalisePhone } from "@/lib/phone";
import { cleanPostalInput, lookupPostal, normalisePostal, outsideWards, type PostalHit } from "@/lib/postal";
import { CleanInput } from "../CleanInput";
import { CheckIcon, WarningIcon } from "../icons";
import s from "../checkout.module.css";
import a from "../account.module.css";

export interface ProfileValues { name: string; phone: string; locale: Locale; postal: string; line1: string; line2: string }

/** Name, phone, address and language (PRD 2.3, 2.6). Same postal lookup and 23-ward rule as the checkout. */
export function ProfileForm({ locale, initial }: { locale: Locale; initial: ProfileValues }) {
  const t = getStrings(locale);
  const router = useRouter();
  // The address form is Japanese-format in both languages (D2); English labels carry the Japanese field name too.
  const jaHint = (label: string) => locale === "en" && <span className="ja" lang="ja">{label}</span>;
  const [v, setV] = useState(initial);
  const [hit, setHit] = useState<PostalHit | null>(() => (initial.postal ? lookupPostal(initial.postal) : null));
  const [postalTried, setPostalTried] = useState(!!initial.postal);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  const set = (patch: Partial<ProfileValues>) => setV((p) => ({ ...p, ...patch }));
  const doLookup = () => { setPostalTried(true); setHit(lookupPostal(v.postal)); };
  const valid = v.name.trim() && normalisePhone(v.phone) && v.line1.trim() && hit?.deliverable;
  const phoneBad = touched && !normalisePhone(v.phone);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await updateProfileAction({ name: v.name, phone: v.phone, locale: v.locale, address: { name: v.name, phone: v.phone, postal: v.postal, line1: v.line1, line2: v.line2 } });
      setStatus(r.ok ? "saved" : "error");
      if (r.ok) {
        if (v.locale !== locale) router.push(`/${v.locale}/account`);
        router.refresh();
      }
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={s.form14} onSubmit={submit} noValidate>
      <div className={s.fields}>
        <div className="field">
          <label htmlFor="pf-name" className="label">{t.recipientName} {jaHint("お名前")}</label>
          <input id="pf-name" type="text" autoComplete="name" required className={`input ${touched && !v.name.trim() ? s.inputError : ""}`} value={v.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="pf-phone" className="label">{t.phone} {jaHint("電話番号")}</label>
          <CleanInput id="pf-phone" type="tel" autoComplete="tel" required clean={cleanPhoneInput} className={`input ${phoneBad ? s.inputError : ""}`} value={v.phone} onValueChange={(phone) => set({ phone })}
            aria-invalid={phoneBad || undefined} aria-describedby="pf-phone-hint" />
          {phoneBad
            ? <span id="pf-phone-hint" className={s.err}><WarningIcon size={16} />{t.phoneInvalid}</span>
            : <span id="pf-phone-hint" className="hint">{t.phoneHint}</span>}
        </div>
        <div className="field">
          <label htmlFor="pf-postal" className="label">{t.postalCode} {jaHint("郵便番号")}</label>
          <div className={s.postalRow}>
            <CleanInput id="pf-postal" type="text" inputMode="numeric" autoComplete="postal-code" clean={cleanPostalInput} className="input" value={v.postal}
              onValueChange={(postal) => { set({ postal }); setPostalTried(false); setHit(null); }}
              onBlur={() => { if (normalisePostal(v.postal).length === 7) doLookup(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } }} />
            <button type="button" className={s.lookupBtn} onClick={doLookup}>{t.lookUp}</button>
          </div>
        </div>
        <div className={s.autofill}>
          <div className={s.k}>{t.filledFrom}</div>
          {hit ? (
            <>
              <div className={s.addr}>{hit.prefecture} {hit.city} {hit.town}</div>
              {hit.deliverable
                ? <div className={s.okPill}><CheckIcon size={15} strokeWidth={3} />{t.weDeliverTo(locale === "ja" ? hit.city : hit.wardEn)}</div>
                : <div className={s.badPill}><WarningIcon size={15} />{t.outsideArea}</div>}
            </>
          ) : (
            <div className={s.addr} style={{ opacity: postalTried ? 1 : 0.5 }}>{postalTried ? <span className={s.badPill}><WarningIcon size={15} />{outsideWards(v.postal) ? t.outsideArea : t.postalNotFound}</span> : "—"}</div>
          )}
        </div>
        <div className="field">
          <label htmlFor="pf-line1" className="label">{t.streetNumber} {jaHint("番地")}</label>
          <input id="pf-line1" type="text" autoComplete="address-line1" required className={`input ${touched && !v.line1.trim() ? s.inputError : ""}`} value={v.line1} onChange={(e) => set({ line1: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="pf-line2" className="label">{t.building} {jaHint("建物名・部屋番号")} <span className="ja">{t.optional}</span></label>
          <input id="pf-line2" type="text" autoComplete="address-line2" placeholder={t.buildingPlaceholder} className="input" value={v.line2} onChange={(e) => set({ line2: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="pf-locale" className="label">{t.language}</label>
          <select id="pf-locale" className="input" value={v.locale} onChange={(e) => set({ locale: e.target.value === "ja" ? "ja" : "en" })}>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
      </div>
      <div className={a.actions}>
        <button type="submit" className="btn btn-primary" disabled={busy}>{t.saveChanges}</button>
        {status === "saved" && <span className={a.status} role="status">{t.saved}</span>}
        {status === "error" && <span className={a.status} role="alert">{t.saveFailed}</span>}
      </div>
    </form>
  );
}
