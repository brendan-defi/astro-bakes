import { settings, type Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import s from "./home.module.css";

export function Footer({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  const p = `/${locale}`;
  const links: [string, string][] = [
    [t.faq, `${p}/faq`], [t.contact, `mailto:${settings.contactEmail}`], [t.instagram, settings.instagramUrl], [t.line, settings.lineUrl],
    [t.tokushoho, `${p}/legal/tokushoho`], [t.privacy, `${p}/legal/privacy`], [t.terms, `${p}/legal/terms`],
  ];
  return (
    <footer className={s.footer}>
      <div className={`container ${s.footerInner}`}>
        <span className={`logo-face ${s.footerLogo}`}>Astro Bakes</span>
        <nav aria-label="Footer" className={s.footerNav}>
          {links.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
        </nav>
        <div className={s.copy}>{t.copyright}</div>
      </div>
    </footer>
  );
}
