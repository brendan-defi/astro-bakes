import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, subscribers } from "@/db/schema";
import type { Locale } from "./data";
import { normaliseEmail } from "./auth-rules";
import { EMAIL } from "./checkout-rules";
import { lockEmail } from "./email-lock";

/**
 * Unsubscribing from drop emails (PRD 1.5, 2.7): one link per address, good for a subscriber and a customer
 * alike, so the welcome email now and drop announcements later share it.
 *
 * The link carries the address and an HMAC of it under UNSUBSCRIBE_SECRET, so nothing is stored and a batch
 * of announcements can mint links without a database round trip. Opening the link never unsubscribes on its
 * own: mail scanners and link previews fetch links. The page asks, and its button (or a mail client's
 * one-click POST, RFC 8058) does it.
 */

const PURPOSE = "unsubscribe:v1:";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://astrobakes.xyz";

/** The secret, or null when it's missing on Vercel. Off Vercel (local, tests) a fixed one keeps links working. */
export function unsubscribeSecret(): string | null {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.VERCEL_ENV) return null;
  return "local-unsubscribe-secret-not-for-production-use";
}

const b64url = (b: Buffer) => b.toString("base64url");
const sign = (email: string, secret: string) => b64url(createHmac("sha256", secret).update(PURPOSE + email).digest());

/** The `e` and `t` query values for an address, or null without a secret. */
export function unsubscribeParams(email: string): { e: string; t: string } | null {
  const secret = unsubscribeSecret();
  if (!secret) return null;
  const normalised = normaliseEmail(email);
  return { e: b64url(Buffer.from(normalised, "utf8")), t: sign(normalised, secret) };
}

/** The address a link was made for, or null if it was made for something else or tampered with. */
export function verifyUnsubscribe(e: unknown, t: unknown): string | null {
  const secret = unsubscribeSecret();
  if (!secret || typeof e !== "string" || typeof t !== "string" || e.length > 400 || t.length > 100) return null;
  let email: string;
  try { email = normaliseEmail(Buffer.from(e, "base64url").toString("utf8")); } catch { return null; }
  if (!EMAIL.test(email)) return null;
  const want = Buffer.from(sign(email, secret));
  const got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got) ? email : null;
}

/** The page link (for the email body) and the one-click endpoint (for the List-Unsubscribe header). */
export function unsubscribeUrls(email: string, locale: Locale): { page: string; oneClick: string } | null {
  const p = unsubscribeParams(email);
  if (!p) return null;
  const q = `e=${p.e}&t=${p.t}`;
  return { page: `${SITE}/${locale}/unsubscribe?${q}`, oneClick: `${SITE}/api/unsubscribe?${q}&l=${locale}` };
}

/** Headers that let mail clients show their own Unsubscribe button (RFC 2369, RFC 8058). Empty without a secret. */
export function unsubscribeHeaders(email: string, locale: Locale): Record<string, string> {
  const u = unsubscribeUrls(email, locale);
  return u ? { "List-Unsubscribe": `<${u.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {};
}

/**
 * Stop drop emails to an address: the subscriber row is marked unsubscribed and a customer's opt-in switched
 * off, whichever exist. Idempotent, and under the same per-address lock as sign-up and first sign-in.
 * Transactional email (order confirmations, sign-in codes) is not affected.
 */
export async function unsubscribe(rawEmail: string, now = new Date()): Promise<{ subscriber: boolean; customer: boolean }> {
  const email = normaliseEmail(rawEmail);
  return getDb().transaction(async (tx) => {
    await lockEmail(tx, email);
    const sub = await tx.update(subscribers).set({ unsubscribedAt: now, updatedAt: now }).where(and(eq(subscribers.email, email), isNull(subscribers.unsubscribedAt))).returning({ id: subscribers.id });
    const cust = await tx.update(customers).set({ marketingOptIn: false, updatedAt: now }).where(and(eq(customers.email, email), eq(customers.marketingOptIn, true))).returning({ id: customers.id });
    return { subscriber: sub.length > 0, customer: cust.length > 0 };
  });
}
