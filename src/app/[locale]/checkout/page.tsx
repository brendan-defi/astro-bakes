import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getHome } from "@/lib/data";
import { demoEnabled } from "@/lib/demo";
import { loadCatalogue, loadDrops, loadSettings } from "@/lib/drops";
import { heldCheckout } from "@/lib/checkout";
import { currentCustomer } from "@/lib/auth";
import { Checkout, type CheckoutCustomer, type CheckoutDrop } from "@/components/Checkout";
import { CartProvider } from "@/lib/cart";
import { cartIdFromCookie } from "@/lib/cart-cookie";
import { privatePage, stringsFor } from "@/lib/metadata";

type Query = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return privatePage(stringsFor(locale).checkoutTitle);
}

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const cartId = await cartIdFromCookie();
  const [drops, catalogue, settings, held, me] = await Promise.all([loadDrops(locale, cartId), loadCatalogue(locale), loadSettings(), heldCheckout(cartId), currentCustomer()]);
  // Signed-in customers skip the email steps and get their saved details prefilled (PRD 2.2, 2.3).
  const customer: CheckoutCustomer | null = me && {
    email: me.email,
    name: me.name ?? "",
    phone: me.phone ?? "",
    postal: me.address?.postalCode ?? "",
    line1: me.address?.line1 ?? "",
    line2: me.address?.line2 ?? "",
  };
  // A checkout with unexpired holds can finish even after the drop closed (PRD 3.8);
  // otherwise sell the drop the homepage shows, which is only the open one.
  const overrides = demoEnabled ? { state: one("state") } : {};
  const home = getHome(overrides, { drops, catalogue, settings });
  const selling = held ? (drops.find((d) => d.id === held.dropSlug) ?? null) : home.state === "open" ? home.drop : null;
  const drop: CheckoutDrop | null = selling && {
    id: selling.id,
    number: selling.number,
    name: selling.name,
    closeAt: selling.closeAt.toISOString(),
    shipAt: selling.shipAt.toISOString(),
    arriveAt: selling.arriveAt.toISOString(),
  };
  return (
    <CartProvider dropId={selling?.id ?? "none"} boxes={selling?.boxes ?? []} shippingFee={settings.shippingFee}>
      <Suspense>
        <Checkout locale={locale} drop={drop} lineUrl={settings.lineUrl} held={held && { checkoutId: held.checkoutId, revision: held.revision, expiresAt: held.expiresAt, items: held.items }} customer={customer} />
      </Suspense>
    </CartProvider>
  );
}
