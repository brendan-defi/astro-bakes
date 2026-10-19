import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { Checkout } from "@/components/Checkout";
import { CartProvider } from "@/lib/cart";
import { boxes, drop, settings } from "@/lib/data";

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // Still on the mock drop until orders are wired; its box IDs match the database slugs so the stored cart carries over.
  return (
    <CartProvider dropId={drop.id} boxes={boxes} shippingFee={settings.shippingFee}>
      <Suspense>
        <Checkout locale={locale} />
      </Suspense>
    </CartProvider>
  );
}
