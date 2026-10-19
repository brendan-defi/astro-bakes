import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getHome } from "@/lib/data";
import { demoEnabled } from "@/lib/demo";
import { loadCatalogue, loadDrops, loadSettings } from "@/lib/drops";
import { Checkout, type CheckoutDrop } from "@/components/Checkout";
import { CartProvider } from "@/lib/cart";

type Query = Record<string, string | string[] | undefined>;

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  // Same resolution as the homepage, so the checkout sells the drop the customer just saw.
  const [drops, catalogue, settings] = await Promise.all([loadDrops(locale), loadCatalogue(locale), loadSettings()]);
  const overrides = demoEnabled ? { state: one("state") } : {};
  const home = getHome(overrides, { drops, catalogue, settings });
  const open = home.state === "open" ? home.drop : null;
  const drop: CheckoutDrop | null = open && {
    id: open.id,
    number: open.number,
    name: open.name,
    closeAt: open.closeAt.toISOString(),
    shipAt: open.shipAt.toISOString(),
    arriveAt: open.arriveAt.toISOString(),
  };
  return (
    <CartProvider dropId={open?.id ?? "none"} boxes={open?.boxes ?? []} shippingFee={settings.shippingFee}>
      <Suspense>
        <Checkout locale={locale} drop={drop} lineUrl={settings.lineUrl} />
      </Suspense>
    </CartProvider>
  );
}
