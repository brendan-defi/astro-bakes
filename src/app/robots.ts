import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/metadata";

/** Crawl everything. Private pages opt out with a noindex tag instead (privatePage), which crawlers only see if they may fetch the page. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` };
}
