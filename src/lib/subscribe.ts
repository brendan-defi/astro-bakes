import "server-only";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, subscribers } from "@/db/schema";
import type { Locale } from "./data";
import { hashIp, normaliseEmail } from "./auth-rules";
import { EMAIL } from "./checkout-rules";
import { loadSettings } from "./drops";
import { sendEmail } from "./email";
import { lockEmail } from "./email-lock";
import { welcomeEmail } from "./email-templates";
import { unsubscribeHeaders, unsubscribeUrls } from "./unsubscribe";

/**
 * Notify-me signup (PRD 1.5): no account needed, single opt-in with the consent line shown beside the
 * form (enough for 特定電子メール法 at this scale). One row per email: signing up again refreshes the
 * consent time and the language, and brings back an address that had unsubscribed.
 *
 * An email that already belongs to a customer is left alone: their own toggle (PRD 2.4) governs it, and an
 * anonymous form must not switch it for them. The reply is the same either way, so it reveals no accounts.
 *
 * Instead of double opt-in (decided 2026-10-21): a generous per-visitor limit stops a script from adding
 * strangers in bulk, and a welcome email with a one-click unsubscribe lets anyone added without asking leave.
 */

/** Sign-ups per visitor (hashed IP) per hour. Generous, since Japanese mobile carriers share one address among many phones. */
export const SIGNUPS_PER_IP_PER_HOUR = 10;

export interface SubscribeInput {
  email: string;
  locale: Locale;
  /** Honeypot: people never see it, bots fill it in. A filled one gets a quiet success and stores nothing. */
  website?: string;
}
export type SubscribeResult = { ok: true } | { ok: false; error: "invalid" | "rate_limited" };

export async function subscribe(input: SubscribeInput, ctx: { ip?: string | null; now?: Date } = {}): Promise<SubscribeResult> {
  if (input?.website?.trim()) return { ok: true };
  const email = normaliseEmail(input?.email ?? "");
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "invalid" };
  const locale: Locale = input.locale === "ja" ? "ja" : "en";
  const now = ctx.now ?? new Date();
  const ipHash = hashIp(ctx.ip);
  // The customer check and the write happen under the same per-address lock as a first sign-in (email-lock.ts),
  // so a signup can neither be overtaken by a sign-in that already read the old subscriber, nor land beside an
  // account created a moment earlier. Then the visitor's lock (always in that order), so the count can't be raced.
  const outcome = await getDb().transaction(async (tx) => {
    await lockEmail(tx, email);
    if (ipHash) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('subscribe-ip'), hashtext(${ipHash}))`);
      const since = new Date(now.getTime() - 3_600_000);
      const [recent] = await tx.select({ n: count() }).from(subscribers).where(and(eq(subscribers.consentIpHash, ipHash), gt(subscribers.consentedAt, since)));
      if (recent.n >= SIGNUPS_PER_IP_PER_HOUR) return "rate_limited" as const;
    }
    const customer = await tx.query.customers.findFirst({ where: eq(customers.email, email), columns: { id: true } });
    if (customer) return null;
    const before = await tx.query.subscribers.findFirst({ where: eq(subscribers.email, email), columns: { unsubscribedAt: true } });
    const [row] = await tx
      .insert(subscribers)
      .values({ email, locale, source: "homepage", consentedAt: now, consentIpHash: ipHash })
      .onConflictDoUpdate({ target: subscribers.email, set: { locale, consentedAt: now, consentIpHash: ipHash, unsubscribedAt: null, updatedAt: now } })
      .returning({ id: subscribers.id });
    // Only an address that just became active gets the welcome: new, or back after unsubscribing.
    return !before || before.unsubscribedAt ? { id: row.id } : null;
  });
  if (outcome === "rate_limited") return { ok: false, error: "rate_limited" };
  if (outcome) await sendWelcome(email, locale, outcome.id, now);
  return { ok: true };
}

async function sendWelcome(email: string, locale: Locale, subscriberId: string, consentedAt: Date) {
  const urls = unsubscribeUrls(email, locale);
  if (!urls) {
    // Never send a drop email without a way out.
    console.error("welcome email not sent: UNSUBSCRIBE_SECRET is not set");
    return;
  }
  const settings = await loadSettings().catch(() => null);
  await sendEmail({
    ...welcomeEmail({ locale, unsubscribeUrl: urls.page, senderName: settings?.legalSellerName?.trim() || "Astro Bakes", contactEmail: settings?.contactEmail ?? "hello@astrobakes.xyz" }),
    to: email,
    type: "welcome",
    idempotencyKey: `welcome/${subscriberId}/${consentedAt.getTime()}`,
    headers: unsubscribeHeaders(email, locale),
  });
}
