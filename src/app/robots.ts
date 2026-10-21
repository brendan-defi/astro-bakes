import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { ADMIN_HOST, requestHostname } from "@/lib/hosts";
import { SITE_URL } from "@/lib/metadata";

/**
 * Crawl everything on the shop. Private pages opt out with a noindex tag instead (privatePage), which crawlers only
 * see if they may fetch the page. The admin host is off limits altogether.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (requestHostname(await headers()) === ADMIN_HOST) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` };
}
