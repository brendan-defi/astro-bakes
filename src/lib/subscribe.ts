import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, subscribers } from "@/db/schema";
import type { Locale } from "./data";
import { normaliseEmail } from "./auth-rules";
import { EMAIL } from "./checkout-rules";

/**
 * Notify-me signup (PRD 1.5): no account needed, single opt-in with the consent line shown beside the
 * form (enough for 特定電子メール法 at this scale). One row per email: signing up again refreshes the
 * consent time and the language, and brings back an address that had unsubscribed.
 *
 * An email that already belongs to a customer is left alone: their own toggle (PRD 2.4) governs it, and an
 * anonymous form must not switch it for them. The reply is the same either way, so it reveals no accounts.
 */

export interface SubscribeInput {
  email: string;
  locale: Locale;
  /** Honeypot: people never see it, bots fill it in. A filled one gets a quiet success and stores nothing. */
  website?: string;
}
export type SubscribeResult = { ok: true } | { ok: false; error: "invalid" };

export async function subscribe(input: SubscribeInput, now = new Date()): Promise<SubscribeResult> {
  if (input?.website?.trim()) return { ok: true };
  const email = normaliseEmail(input?.email ?? "");
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "invalid" };
  const locale: Locale = input.locale === "ja" ? "ja" : "en";
  const db = getDb();
  const customer = await db.query.customers.findFirst({ where: eq(customers.email, email), columns: { id: true } });
  if (customer) return { ok: true };
  await db
    .insert(subscribers)
    .values({ email, locale, source: "homepage", consentedAt: now })
    .onConflictDoUpdate({ target: subscribers.email, set: { locale, consentedAt: now, unsubscribedAt: null, updatedAt: now } });
  return { ok: true };
}
