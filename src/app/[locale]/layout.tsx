import type { Metadata } from "next";
import { Titan_One, Pacifico, Zen_Maru_Gothic } from "next/font/google";
import { notFound } from "next/navigation";
import { CartProvider } from "@/lib/cart";
import { isLocale } from "@/lib/i18n";
import "../globals.css";

const display = Titan_One({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });
const logo = Pacifico({ weight: "400", subsets: ["latin"], variable: "--font-logo", display: "swap" });
const body = Zen_Maru_Gothic({ weight: ["500", "700", "900"], subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Astro Bakes",
  description: "American-style bakes, launched one drop at a time. Baked in Nakameguro, delivered across Tokyo's 23 wards.",
};

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "ja" }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={`${display.variable} ${logo.variable} ${body.variable}`}>
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
