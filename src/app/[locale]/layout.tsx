import type { Metadata, Viewport } from "next";
import { Titan_One, Pacifico, Zen_Maru_Gothic } from "next/font/google";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { SITE_URL, stringsFor } from "@/lib/metadata";
import "../globals.css";

const display = Titan_One({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });
const logo = Pacifico({ weight: "400", subsets: ["latin"], variable: "--font-logo", display: "swap" });
const body = Zen_Maru_Gothic({ weight: ["500", "700", "900"], subsets: ["latin"], variable: "--font-body", display: "swap" });

/**
 * Site-wide metadata. Most visitors arrive from Instagram and LINE links, so the
 * link preview (title, description, opengraph-image.tsx) matters most.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = stringsFor(locale);
  const [ogLocale, otherOgLocale] = locale === "ja" ? ["ja_JP", "en_US"] : ["en_US", "ja_JP"];
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: "Astro Bakes",
    title: { default: t.metaTitle, template: t.metaTitleTemplate },
    description: t.metaDescription,
    openGraph: {
      type: "website",
      siteName: "Astro Bakes",
      title: t.metaTitle,
      description: t.metaDescription,
      locale: ogLocale,
      alternateLocale: otherOgLocale,
    },
    twitter: { card: "summary_large_image" },
  };
}

/** Ink, like the ticker at the top of every page, so a phone's browser bar runs into it. */
export const viewport: Viewport = { themeColor: "#2a1b5e" };

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
        {children}
      </body>
    </html>
  );
}
