import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { openGraphBase, SITE_URL, stringsFor } from "@/lib/metadata";
import { SelectionColors } from "@/components/SelectionColors";
import { fontVariables } from "../fonts";
import "../globals.css";

/**
 * Site-wide metadata. Most visitors arrive from Instagram and LINE links, so the
 * link preview (title, description, opengraph-image.tsx) matters most.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = stringsFor(locale);
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: "Astro Bakes",
    title: { default: t.metaTitle, template: t.metaTitleTemplate },
    description: t.metaDescription,
    openGraph: { ...openGraphBase(locale), title: t.metaTitle, description: t.metaDescription },
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
    <html lang={locale} className={fontVariables}>
      <body>
        {children}
        <SelectionColors />
      </body>
    </html>
  );
}
