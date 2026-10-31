import { DASHES } from "./phone";

/**
 * Japan Post tracking numbers (お問い合わせ番号, PRD 3.7, 4.6): read however they're typed, stored as digits, shown
 * the way Japan Post prints them, and linked to Japan Post's own tracking page. Client-safe, so the admin, the emails
 * and the customer's order page all share it.
 */

/** A ゆうパック tracking number is 12 digits, printed 1234-5678-9012. */
const DIGITS = 12;

/** The digits of a tracking number typed or pasted any way (spaces, hyphens, full-width digits), or null. */
export function parseTracking(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = raw.normalize("NFKC").replace(DASHES, "").replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${DIGITS}}$`).test(d) ? d : null;
}

/** 123456789012 → 1234-5678-9012; anything else as stored. */
export function formatTracking(digits: string): string {
  return /^\d{12}$/.test(digits) ? `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}` : digits;
}

/** Japan Post's page for this one parcel, in the customer's language. */
export function trackingUrl(digits: string, locale: "en" | "ja"): string {
  return `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${encodeURIComponent(digits)}&searchKind=S002&locale=${locale}`;
}

export const TRACKING_HELP = "The 12-digit number on the Japan Post label, like 1234-5678-9012.";
