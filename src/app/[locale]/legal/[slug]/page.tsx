import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { settings as defaultSettings } from "@/lib/data";
import { loadSettings } from "@/lib/drops";
import { getStrings, isLocale } from "@/lib/i18n";
import { isLegalSlug, LEGAL_SLUGS, LEGAL_TITLES, legalDocument } from "@/lib/legal";
import { Footer } from "@/components/Footer";
import { LangToggle } from "@/components/LangToggle";
import { Logo } from "@/components/Logo";
import { ArrowLeftIcon } from "@/components/icons";
import s from "@/components/checkout.module.css";
import l from "@/components/legal.module.css";

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !isLegalSlug(slug)) return {};
  return { title: `${LEGAL_TITLES[slug][locale]} · Astro Bakes` };
}

/** The three legal pages (PRD 1.8). Copy lives in src/lib/legal.ts; the 特商法 seller fields come from settings (PRD 4.9). */
export default async function LegalPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !isLegalSlug(slug)) notFound();
  const t = getStrings(locale);
  const home = `/${locale}`;
  const settings = await loadSettings().catch(() => defaultSettings);
  const doc = legalDocument(slug, locale, settings)!;
  const updated = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-GB", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" }).format(doc.updated);
  const others = LEGAL_SLUGS.filter((x) => x !== slug);
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={`container ${s.headerRow}`}>
          <Link href={home} aria-label={t.backToShop} className={s.iconBtn}><ArrowLeftIcon /></Link>
          <Logo href={home} label={t.home} size="sm" />
          <LangToggle locale={locale} hrefFor={(l) => `/${l}/legal/${slug}`} />
        </div>
      </header>
      <div className={s.body}>
        <main className={s.main}>
          <article className={l.doc} lang={locale}>
            <div className="stack" style={{ gap: 6 }}>
              <h1 className={`display ${s.h1sm}`}>{doc.title}</h1>
              <p className={l.updated}>{locale === "ja" ? `最終更新日：${updated}` : `Last updated ${updated}`}</p>
            </div>
            {doc.note && <p className={l.note}>{doc.note}</p>}
            {doc.sections.map((sec, i) => (
              <section key={i} className={l.section}>
                {sec.heading && <h2 className={`display ${l.h2}`}>{sec.heading}</h2>}
                {sec.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
                {sec.bullets && <ul className={l.bullets}>{sec.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
                {sec.rows && (
                  <dl className={l.dl}>
                    {sec.rows.map((r) => (
                      <div key={r.label} className={l.row}><dt>{r.label}</dt><dd>{r.value}</dd></div>
                    ))}
                  </dl>
                )}
              </section>
            ))}
            <nav aria-label={t.footerNav} className={l.related}>
              {others.map((o) => <Link key={o} href={`${home}/legal/${o}`} className="btn btn-secondary">{LEGAL_TITLES[o][locale]}</Link>)}
            </nav>
          </article>
        </main>
      </div>
      <Footer locale={locale} settings={settings} />
    </div>
  );
}
