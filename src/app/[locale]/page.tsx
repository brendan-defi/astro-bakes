import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHome, mockSource } from "@/lib/data";
import { demoEnabled } from "@/lib/demo";
import { loadCatalogue, loadDrops, loadSettings, loadViewerOrder } from "@/lib/drops";
import { currentCustomer } from "@/lib/auth";
import { cartIdFromCookie } from "@/lib/cart-cookie";
import { isLocale } from "@/lib/i18n";
import { Ticker } from "@/components/Ticker";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Wave } from "@/components/Wave";
import { Boxes } from "@/components/Boxes";
import { HowItWorks } from "@/components/HowItWorks";
import { Story } from "@/components/Story";
import { PartyOrders } from "@/components/PartyOrders";
import { Notify } from "@/components/Notify";
import { Footer } from "@/components/Footer";
import { CartBar } from "@/components/CartBar";
import { CartProvider } from "@/lib/cart";

type Query = Record<string, string | string[] | undefined>;

/** The two homepages are translations of each other; / picks one from the browser (proxy.ts). Title and preview come from the layout. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: { canonical: `/${locale}`, languages: { en: "/en", ja: "/ja", "x-default": "/" } } };
}

export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  // Homepage variant from the drop state machine over the database. Outside production,
  // ?state= / ?next= / ?viewer= override it so every variant can be opened directly (README).
  const [drops, catalogue, settings, me] = await Promise.all([loadDrops(locale, await cartIdFromCookie()), loadCatalogue(locale), loadSettings(), currentCustomer()]);
  const overrides = demoEnabled ? { state: one("state"), next: one("next"), viewer: one("viewer") } : {};
  let home = getHome(overrides, { drops, catalogue, settings });
  // A forced state the database can't supply (no live drop between drops, e.g. ?state=open on a preview)
  // falls back to the sample drops, so the open-drop UI can still be reviewed. Never in production.
  if (overrides.state && home.state !== overrides.state) home = getHome(overrides, { ...mockSource, settings });
  if (me && !overrides.viewer) {
    // A real session beats the sample viewer: avatar, notification preference, and their order in the drop on show.
    const order = home.drop ? await loadViewerOrder(me.id, home.drop.id) : null;
    home = { ...home, viewer: { signedIn: true, initial: (me.name || me.email).trim().charAt(0).toUpperCase(), optedIn: me.marketingOptIn, order } };
  }
  const open = home.state === "open";
  return (
    // The cart is scoped to the drop on show, so steppers clamp against its real stock and prices.
    <CartProvider dropId={home.drop?.id ?? "none"} boxes={home.drop?.boxes ?? []} shippingFee={settings.shippingFee}>
      <Ticker locale={locale} home={home} />
      <Nav locale={locale} showCart={open} viewer={home.viewer} />
      <Hero locale={locale} home={home} />
      <Wave from="var(--lilac)" to="var(--ground)" />
      <Boxes locale={locale} home={home} />
      <Wave from="var(--ground)" to="var(--butter)" reverse />
      <HowItWorks locale={locale} settings={settings} />
      <Wave from="var(--butter)" to="var(--pink-soft)" />
      <PartyOrders locale={locale} />
      <Story locale={locale} settings={settings} />
      <Notify locale={locale} settings={settings} viewer={home.viewer} />
      <Footer locale={locale} settings={settings} />
      {open && <CartBar locale={locale} />}
    </CartProvider>
  );
}
