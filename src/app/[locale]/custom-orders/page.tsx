import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentCustomer } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { dateRange } from "@/lib/custom-order-rules";
import { anonymousViewer, type Viewer } from "@/lib/data";
import { loadSettings } from "@/lib/drops";
import { getStrings, isLocale } from "@/lib/i18n";
import { publicPage, stringsFor } from "@/lib/metadata";
import { CustomOrderForm } from "@/components/CustomOrderForm";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { Wave } from "@/components/Wave";
import h from "@/components/home.module.css";
import s from "@/components/parties.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = stringsFor(locale);
  return publicPage(locale, "/custom-orders", t.partiesEyebrow, t.customOrdersMeta);
}

/** Party and custom orders: the request form behind the homepage's "Want cookies at your next party?" band. */
export default async function CustomOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getStrings(locale);
  const [settings, me] = await Promise.all([loadSettings(), currentCustomer()]);
  const viewer: Viewer = me ? { signedIn: true, initial: (me.name || me.email).trim().charAt(0).toUpperCase(), optedIn: me.marketingOptIn, order: null } : anonymousViewer;
  const { min, max } = dateRange();
  const steps = [
    { text: t.nextStep1, bg: "var(--pink)" },
    { text: t.nextStep2, bg: "var(--aqua)" },
    { text: t.nextStep3, bg: "var(--butter)" },
  ];
  return (
    // No drop is sold here; the provider is only for the nav's cart state.
    <CartProvider dropId="none" boxes={[]} shippingFee={settings.shippingFee}>
      <Nav locale={locale} viewer={viewer} />
      <main>
        <section className={s.hero}>
          <div className={`container ${s.heroInner}`}>
            <span className={h.eyebrowSticker}>{t.partiesEyebrow}</span>
            <h1 className={`display ${s.title}`}>{t.customOrdersTitle}</h1>
            <p className={s.lead}>{t.customOrdersLead}</p>
          </div>
        </section>
        <Wave from="var(--pink-soft)" to="var(--ground)" />
        <section className={s.body}>
          <div className={`container ${s.grid}`}>
            <div className={`card ${s.formCard}`}>
              <CustomOrderForm locale={locale} initial={{ name: me?.name ?? "", email: me?.email ?? "" }} dateMin={min} dateMax={max} />
            </div>
            <aside className={s.aside} aria-labelledby="next-h">
              <h2 id="next-h" className={`display ${s.asideTitle}`}>{t.nextStepsTitle}</h2>
              <ol className={s.next}>
                {steps.map((st, i) => (
                  <li key={i} className={s.nextItem}>
                    <span className={s.nextNum} style={{ background: st.bg }}>{i + 1}</span>
                    <span>{st.text}</span>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>
      </main>
      <Footer locale={locale} settings={settings} />
    </CartProvider>
  );
}
