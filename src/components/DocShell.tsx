import Link from "next/link";
import type { Locale, Settings } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { Footer } from "./Footer";
import { LangToggle } from "./LangToggle";
import { Logo } from "./Logo";
import { ArrowLeftIcon } from "./icons";
import s from "./checkout.module.css";
import l from "./legal.module.css";

/** Chrome for the reading pages (legal, FAQ): the checkout header with the JA/EN toggle, one column, the footer. */
export function DocShell({ locale, settings, hrefFor, children }: { locale: Locale; settings: Settings; hrefFor: (l: Locale) => string; children: React.ReactNode }) {
  const t = getStrings(locale);
  const home = `/${locale}`;
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={`container ${s.headerRow}`}>
          <Link href={home} aria-label={t.backToShop} className={s.iconBtn}><ArrowLeftIcon /></Link>
          <Logo href={home} label={t.home} size="sm" />
          <LangToggle locale={locale} hrefFor={hrefFor} />
        </div>
      </header>
      <div className={s.body}>
        <main className={s.main}>
          <article className={l.doc} lang={locale}>{children}</article>
        </main>
      </div>
      <Footer locale={locale} settings={settings} />
    </div>
  );
}
