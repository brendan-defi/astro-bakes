import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { openGraphBase, SITE_URL, stringsFor } from "@/lib/metadata";
import { MotionSync } from "@/components/MotionSync";
import { SelectionColors } from "@/components/SelectionColors";
import { MOTION_ATTR, MOTION_KEY, PAUSED } from "@/lib/motion-pause";
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

/** Before React runs: a viewer who paused the animations (MotionToggle) keeps them paused on the next page, with no first frame of motion. */
const PAUSE_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(MOTION_KEY)})===${JSON.stringify(PAUSED)})document.documentElement.dataset.${MOTION_ATTR}=${JSON.stringify(PAUSED)}}catch(e){}`;

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
    // suppressHydrationWarning: PAUSE_SCRIPT may add data-motion to <html> before hydration.
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PAUSE_SCRIPT }} />
        {children}
        <SelectionColors />
        <MotionSync />
      </body>
    </html>
  );
}
