import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { settings as defaultSettings } from "@/lib/data";
import { loadSettings } from "@/lib/drops";
import { faqEntries } from "@/lib/faq";
import { getStrings, isLocale } from "@/lib/i18n";
import { DocShell } from "@/components/DocShell";
import s from "@/components/checkout.module.css";
import l from "@/components/legal.module.css";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${getStrings(locale).faq} · Astro Bakes` };
}

/** The FAQ (PRD 1.7). Copy lives in src/lib/faq.ts. */
export default async function FaqPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getStrings(locale);
  await connection(); // render per request so the fee and contact address follow the settings, like the legal pages
  const settings = await loadSettings().catch(() => defaultSettings);
  const entries = faqEntries(locale, settings);
  return (
    <DocShell locale={locale} settings={settings} hrefFor={(l) => `/${l}/faq`}>
      <h1 className={`display ${s.h1sm}`}>{t.faq}</h1>
      <div className={l.faqList}>
        {entries.map((e) => (
          <section key={e.id} id={e.id} className={l.faqItem}>
            <h2 className={`display ${l.faqQ}`}>{e.q}</h2>
            {e.a.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
      </div>
    </DocShell>
  );
}
