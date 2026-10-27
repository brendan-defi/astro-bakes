import type { Locale, Settings } from "@/lib/data";
import { getStrings, jaLang } from "@/lib/i18n";
import s from "./home.module.css";

export function Footer({ locale, settings }: { locale: Locale; settings: Settings }) {
  const t = getStrings(locale);
  const p = `/${locale}`;
  // The legal pages keep their Japanese names on the English site, so those links are marked lang="ja" there.
  const links: [string, string, "ja"?][] = [
    [t.faq, `${p}/faq`], [t.partiesEyebrow, `${p}/custom-orders`], [t.contact, `mailto:${settings.contactEmail}`], [t.instagram, settings.instagramUrl], [t.line, settings.lineUrl],
    [t.tokushoho, `${p}/legal/tokushoho`, jaLang(locale)], [t.privacy, `${p}/legal/privacy`, jaLang(locale)], [t.terms, `${p}/legal/terms`, jaLang(locale)],
  ];
  return (
    <footer className={s.footer}>
      <div className={`container ${s.footerInner}`}>
        <span className={`logo-face ${s.footerLogo}`}>Astro Bakes</span>
        <nav aria-label={t.footerNav} className={s.footerNav}>
          {links.map(([label, href, lang]) => <a key={label} href={href} lang={lang}>{label}</a>)}
        </nav>
        <div className={s.copy}>{t.copyright}</div>
      </div>
    </footer>
  );
}
