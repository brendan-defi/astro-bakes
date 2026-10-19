import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { Ticker } from "@/components/Ticker";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Wave } from "@/components/Wave";
import { Boxes } from "@/components/Boxes";
import { HowItWorks } from "@/components/HowItWorks";
import { Story } from "@/components/Story";
import { Notify } from "@/components/Notify";
import { Footer } from "@/components/Footer";
import { CartBar } from "@/components/CartBar";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <>
      <Ticker locale={locale} />
      <Nav locale={locale} />
      <Hero locale={locale} />
      <Wave from="var(--lilac)" to="var(--ground)" />
      <Boxes locale={locale} />
      <Wave from="var(--ground)" to="var(--butter)" />
      <HowItWorks locale={locale} />
      <Story locale={locale} />
      <Notify locale={locale} />
      <Footer locale={locale} />
      <CartBar locale={locale} />
    </>
  );
}
