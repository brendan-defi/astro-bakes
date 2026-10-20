import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { SITE_URL } from "@/lib/metadata";

/** Public pages, one entry per language, each listing its translations. */
const PAGES = ["", "/faq", "/legal/tokushoho", "/legal/privacy", "/legal/terms", "/custom-orders"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((path) => {
    const languages = Object.fromEntries(locales.map((l) => [l, `${SITE_URL}/${l}${path}`]));
    return locales.map((l) => ({ url: `${SITE_URL}/${l}${path}`, alternates: { languages } }));
  });
}
