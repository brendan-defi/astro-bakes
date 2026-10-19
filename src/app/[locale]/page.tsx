import { notFound } from "next/navigation";
import { getHome } from "@/lib/data";
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

type Query = Record<string, string | string[] | undefined>;

export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  // Homepage variant from the drop state machine, or a ?state= / ?viewer= demo override (README).
  const home = getHome({ state: one("state"), next: one("next"), viewer: one("viewer") });
  const open = home.state === "open";
  return (
    <>
      <Ticker locale={locale} home={home} />
      <Nav locale={locale} showCart={open} viewer={home.viewer} />
      <Hero locale={locale} home={home} />
      <Wave from="var(--lilac)" to="var(--ground)" />
      <Boxes locale={locale} home={home} />
      <Wave from="var(--ground)" to="var(--butter)" />
      <HowItWorks locale={locale} />
      <Story locale={locale} />
      <Notify locale={locale} viewer={home.viewer} />
      <Footer locale={locale} />
      {open && <CartBar locale={locale} />}
    </>
  );
}
