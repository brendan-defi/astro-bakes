import type { Metadata } from "next";
import { getStrings, isLocale } from "./i18n";

/** Production origin. Link previews, canonical URLs and the sitemap need absolute URLs, on previews too. */
export const SITE_URL = "https://astrobakes.xyz";

/** Strings for a route's locale param. Pages 404 on an unknown locale; metadata runs alongside, so fall back rather than throw. */
export const stringsFor = (locale: string) => getStrings(isLocale(locale) ? locale : "en");

/** Pages that only mean something to one customer (checkout, account, sign-in): a title of their own, kept out of search. */
export function privatePage(title: string): Metadata {
  return { title, robots: { index: false } };
}
