import "server-only";
import { and, count, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, signupAttempts, subscribers } from "@/db/schema";
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
 * anonymous form must not switch it for them. The reply is the same either way, and so is the cost against
 * the visitor's allowance, so neither reveals accounts.
 *
 * Instead of double opt-in (decided 2026-10-21): a generous per-visitor limit stops a script from adding
 * strangers in bulk, and a welcome email with a one-click unsubscribe lets anyone added without asking leave.
 */

/** Valid sign-up attempts per visitor (hashed IP) per hour. Generous, since Japanese mobile carriers share one address among many phones. */
export const SIGNUPS_PER_IP_PER_HOUR = 10;
/** A welcome that keeps failing is given up after this many tries, and any still unsent this long after the sign-up is dropped. */
export const WELCOME_MAX_ATTEMPTS = 5;
export const WELCOME_RETRY_WINDOW_MS = 7 * 86_400_000;

const HOUR = 3_600_000;

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
      await tx.delete(signupAttempts).where(lt(signupAttempts.createdAt, new Date(now.getTime() - 24 * HOUR)));
      const [recent] = await tx.select({ n: count() }).from(signupAttempts).where(and(eq(signupAttempts.ipHash, ipHash), gt(signupAttempts.createdAt, new Date(now.getTime() - HOUR))));
      if (recent.n >= SIGNUPS_PER_IP_PER_HOUR) return "rate_limited" as const;
      // Counted before anything depends on who the address belongs to.
      await tx.insert(signupAttempts).values({ ipHash, createdAt: now });
    }
    const customer = await tx.query.customers.findFirst({ where: eq(customers.email, email), columns: { id: true } });
    if (customer) return null;
    const before = await tx.query.subscribers.findFirst({ where: eq(subscribers.email, email), columns: { unsubscribedAt: true, welcomeRequestedAt: true, welcomeSentAt: true } });
    const activating = !before || before.unsubscribedAt !== null;
    const refresh = { locale, consentedAt: now, consentIpHash: ipHash, unsubscribedAt: null, updatedAt: now };
    // A new activation owes a fresh welcome; an address already on the list keeps whatever it's owed.
    const welcome = activating ? { welcomeRequestedAt: now, welcomeSentAt: null, welcomeAttempts: 0, welcomeNextAttemptAt: null } : {};
    const [row] = await tx
      .insert(subscribers)
      .values({ email, locale, source: "homepage", consentedAt: now, consentIpHash: ipHash, welcomeRequestedAt: now })
      .onConflictDoUpdate({ target: subscribers.email, set: { ...refresh, ...welcome } })
      .returning({ id: subscribers.id });
    // Signing up again is also how someone whose welcome never arrived asks for it.
    const owed = activating || (before.welcomeRequestedAt !== null && before.welcomeSentAt === null);
    return owed ? row.id : null;
  });
  if (outcome === "rate_limited") return { ok: false, error: "rate_limited" };
  if (outcome) await deliverWelcome(outcome, now);
  return { ok: true };
}

export type WelcomeOutcome = "sent" | "failed" | "not_owed" | "not_due" | "no_secret" | "gave_up";

/** How long to wait after each failed try before the next: 1 minute, 10 minutes, 1 hour, 6 hours. */
const WELCOME_BACKOFF_MS = [60_000, 600_000, 3_600_000, 6 * 3_600_000];

/**
 * Try to deliver the welcome a subscriber is owed.
 *
 * The whole attempt runs under the address's lock (email-lock.ts), from re-reading the row to recording the
 * result, with the provider call inside it. unsubscribe() and a first sign-in take the same lock, so an
 * unsubscribe can never be reported done while a welcome is about to go out: either the send finishes first,
 * or the re-read here sees the opt-out and sends nothing. Two workers on the same address queue on the lock,
 * and the second sees the first one's result (sent, or backing off), so the attempt cap can't be overshot.
 *
 * Without UNSUBSCRIBE_SECRET it waits (no attempt used), so fixing the configuration lets the retry send it.
 */
export async function deliverWelcome(subscriberId: string, now = new Date()): Promise<WelcomeOutcome> {
  const db = getDb();
  const peek = await db.query.subscribers.findFirst({ where: eq(subscribers.id, subscriberId), columns: { email: true } });
  if (!peek) return "not_owed";
  // Read outside the lock, to keep it short; the send logs on the same connection (sendEmail's conn), so a few
  // deliveries at once can't starve the pool.
  const settings = await loadSettings().catch(() => null);
  const contactEmail = settings?.contactEmail ?? "hello@astrobakes.xyz";
  const senderName = settings?.legalSellerName?.trim() || "Astro Bakes";
  return db.transaction(async (tx) => {
    await lockEmail(tx, peek.email);
    const [s] = await tx.select().from(subscribers).where(eq(subscribers.id, subscriberId)).for("update");
    if (!s || s.unsubscribedAt || s.convertedCustomerId || s.welcomeSentAt || !s.welcomeRequestedAt) return "not_owed";
    if (s.welcomeAttempts >= WELCOME_MAX_ATTEMPTS || now.getTime() - s.welcomeRequestedAt.getTime() > WELCOME_RETRY_WINDOW_MS) return "gave_up";
    if (s.welcomeNextAttemptAt && s.welcomeNextAttemptAt > now) return "not_due";
    const urls = unsubscribeUrls(s.email, s.locale);
    if (!urls) {
      // Never send a drop email without a way out.
      console.error("welcome email waiting: UNSUBSCRIBE_SECRET is not set");
      return "no_secret";
    }
    const sent = await sendEmail(
      {
        ...welcomeEmail({ locale: s.locale, unsubscribeUrl: urls.page, senderName, contactEmail }),
        to: s.email,
        type: "welcome",
        replyTo: contactEmail,
        // One key per activation, as a second line of defence against a duplicate.
        idempotencyKey: `welcome/${s.id}/${s.welcomeRequestedAt.getTime()}`,
        headers: unsubscribeHeaders(s.email, s.locale),
      },
      { conn: tx },
    );
    const attempts = s.welcomeAttempts + 1;
    if (sent.ok) {
      await tx.update(subscribers).set({ welcomeSentAt: now, welcomeAttempts: attempts, welcomeNextAttemptAt: null }).where(eq(subscribers.id, s.id));
      return "sent";
    }
    const wait = WELCOME_BACKOFF_MS[Math.min(attempts, WELCOME_BACKOFF_MS.length) - 1];
    await tx.update(subscribers).set({ welcomeAttempts: attempts, welcomeNextAttemptAt: new Date(now.getTime() + wait) }).where(eq(subscribers.id, s.id));
    return "failed";
  });
}

/**
 * Retry a few welcomes that didn't go out: run after successful sign-ups, so it needs no scheduler. Only rows
 * that are due (past their back-off), under the cap and inside the window; deliverWelcome re-checks all of it
 * under the lock, so overlapping passes are harmless.
 */
export async function retryPendingWelcomes(opts: { limit?: number; now?: Date } = {}): Promise<WelcomeOutcome[]> {
  const now = opts.now ?? new Date();
  const due = await getDb()
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(
      isNull(subscribers.welcomeSentAt),
      isNull(subscribers.unsubscribedAt),
      isNull(subscribers.convertedCustomerId),
      lt(subscribers.welcomeAttempts, WELCOME_MAX_ATTEMPTS),
      gt(subscribers.welcomeRequestedAt, new Date(now.getTime() - WELCOME_RETRY_WINDOW_MS)),
      or(isNull(subscribers.welcomeNextAttemptAt), lte(subscribers.welcomeNextAttemptAt, now)),
    ))
    .orderBy(subscribers.welcomeRequestedAt)
    .limit(opts.limit ?? 5);
  const results: WelcomeOutcome[] = [];
  for (const { id } of due) results.push(await deliverWelcome(id, now));
  return results;
}
