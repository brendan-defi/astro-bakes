import type { Metadata } from "next";
import { getStrings, isLocale } from "./i18n";

/** Production origin. Link previews, canonical URLs and the sitemap need absolute URLs, on previews too. */
export const SITE_URL = "https://astrobakes.xyz";

/** Strings for a route's locale param. Pages 404 on an unknown locale; metadata runs alongside, so fall back rather than throw. */
export const stringsFor = (locale: string) => getStrings(isLocale(locale) ? locale : "en");

/**
 * Link-preview fields every page shares. A page that sets its own openGraph replaces the
 * layout's whole object (metadata merges shallowly), so it starts from these.
 */
export function openGraphBase(locale: string) {
  const [ogLocale, otherOgLocale] = locale === "ja" ? ["ja_JP", "en_US"] : ["en_US", "ja_JP"];
  return { type: "website" as const, siteName: "Astro Bakes", locale: ogLocale, alternateLocale: otherOgLocale };
}

/** Public pages besides home (`path` like "/custom-orders"): their own title and link preview, a canonical URL and the other language's version. */
export function publicPage(locale: string, path: string, title: string, description: string): Metadata {
  const t = stringsFor(locale);
  return {
    title,
    description,
    alternates: { canonical: `/${locale}${path}`, languages: { en: `/en${path}`, ja: `/ja${path}` } },
    // Setting openGraph here drops the layout's card, so point at it again (id "card" in [locale]/opengraph-image.tsx).
    // The title template doesn't reach og:title either, so the preview spells out the brand itself.
    openGraph: {
      ...openGraphBase(locale),
      title: t.metaTitleTemplate.replace("%s", title),
      description,
      url: `/${locale}${path}`,
      images: [{ url: `/${locale}/opengraph-image/card`, width: 1200, height: 630, type: "image/png", alt: t.ogImageAlt }],
    },
  };
}

/** Pages that only mean something to one customer (checkout, account, sign-in): a title of their own, kept out of search. */
export function privatePage(title: string): Metadata {
  return { title, robots: { index: false } };
}
