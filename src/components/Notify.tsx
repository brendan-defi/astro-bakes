import Link from "next/link";
import { anonymousViewer, type Locale, type Settings, type Viewer } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { NotifyForm } from "./NotifyForm";
import { OptInButton } from "./OptInButton";
import s from "./home.module.css";

/** Notify-me capture (PRD 1.5). Signed-in viewers see their preference, or a one-tap opt-in, instead of an email field. */
export function Notify({ locale, settings, viewer = anonymousViewer }: { locale: Locale; settings: Settings; viewer?: Viewer }) {
  const t = getStrings(locale);
  return (
    <section id="notify" className={s.notify}>
      <div className={`container ${s.notifyInner}`}>
        <div className={s.notifyText}>
          <h2 className="display h2">{t.notifyTitle}</h2>
          <p className={s.notifySub}>{t.notifySub}</p>
          {viewer.signedIn && viewer.optedIn ? (
            <div className={s.onListText} role="status">{t.onListAccount} <Link href={`/${locale}/account`}>{t.accountTitle} →</Link></div>
          ) : viewer.signedIn ? (
            <OptInButton locale={locale} variant="section" label={t.optInGeneric} consent={t.notifyConsent} doneText={t.onListGeneric} />
          ) : (
            <NotifyForm locale={locale} id="notify-email" variant="section" label={t.emailAddress} button={t.notifyCta} consent={t.notifyConsent} />
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
