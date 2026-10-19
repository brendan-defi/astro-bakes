import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { authTokens, customers, sessions, subscribers } from "@/db/schema";
import type { Locale } from "./data";
import { sendEmail } from "./email";
import { signInEmail } from "./email-templates";
import { readSessionToken } from "./session-cookie";
import {
  CODE_LENGTH,
  codeMatches,
  EMAIL,
  flowMatches,
  generateCode,
  generateToken,
  hashCode,
  hashFlow,
  hashIp,
  hashSession,
  hashToken,
  maskEmail,
  MAX_CODE_ATTEMPTS,
  normaliseEmail,
  RATE_PER_EMAIL,
  RATE_PER_IP,
  RATE_WINDOW_MINUTES,
  safeNext,
  SESSION_DAYS,
  TOKEN_MINUTES,
} from "./auth-rules";

/**
 * Magic link + 6-digit code sign-in (D12, D13, PRD 2.1, 2.7, 5.4).
 *
 *   requestSignIn   one email with a link and a code; same answer whether or
 *                   not the address has an account; rate-limited per email and
 *                   per IP under advisory locks so concurrent requests can't
 *                   slip past the allowance. The token remembers the hash of
 *                   the requesting browser's flow cookie.
 *   peekLink        what a link is for, without spending it (confirmation page).
 *   redeemLink      spends the link. Silent only for the browser that asked for
 *                   it (flow cookie matches); any other browser must confirm
 *                   through a same-origin POST, so a link can never switch
 *                   someone's account without their say-so (login CSRF).
 *   verifyCode      the code against the newest live token for that email,
 *                   from the requesting browser only, locked after a few tries.
 *   Both create the customer on first verified sign-in (conflict-safe),
 *   convert a matching subscriber, and open a 90-day session.
 */

type Conn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
const DAY = 86_400_000;

let codeGenerator: () => string = generateCode;
/** Tests only: make codes deterministic. */
export function setCodeGenerator(fn: (() => string) | null) {
  codeGenerator = fn ?? generateCode;
}

// ---------------------------------------------------------------- request

export interface RequestInput {
  email: string;
  locale: Locale;
  /** Same-site path to return to after sign-in. */
  next?: string | null;
  ip?: string | null;
  /** "https://astrobakes.xyz": the host the link should point at (the request's own host). */
  origin: string;
  /** The browser's flow secret (cookie), so only that browser redeems silently. */
  flowSecret: string;
}

export type RequestResult = { ok: true } | { ok: false; error: "invalid_email" | "rate_limited" };

export async function requestSignIn(input: RequestInput): Promise<RequestResult> {
  const email = normaliseEmail(input.email);
  if (!EMAIL.test(email) || !input.flowSecret) return { ok: false, error: "invalid_email" };
  const db = getDb();
  const ipHash = hashIp(input.ip);
  const id = randomUUID();
  const token = generateToken();
  const code = codeGenerator();
  const next = safeNext(input.next, `/${input.locale}`);

  // Check and consume the allowances atomically: lock the email, then the IP (always that order), then count and insert.
  const allowed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('signin-email'), hashtext(${email}))`);
    if (ipHash) await tx.execute(sql`select pg_advisory_xact_lock(hashtext('signin-ip'), hashtext(${ipHash}))`);
    const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000);
    const [byEmail] = await tx.select({ n: count() }).from(authTokens).where(and(eq(authTokens.email, email), gt(authTokens.createdAt, since)));
    if (byEmail.n >= RATE_PER_EMAIL) return false;
    if (ipHash) {
      const [byIp] = await tx.select({ n: count() }).from(authTokens).where(and(eq(authTokens.ipHash, ipHash), gt(authTokens.createdAt, since)));
      if (byIp.n >= RATE_PER_IP) return false;
    }
    await tx.insert(authTokens).values({
      id,
      email,
      tokenHash: hashToken(token),
      codeHash: hashCode(id, code),
      flowHash: hashFlow(input.flowSecret),
      locale: input.locale,
      next,
      ipHash,
      expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000),
    });
    return true;
  });
  if (!allowed) return { ok: false, error: "rate_limited" };

  const link = `${input.origin}/${input.locale}/auth/verify?token=${encodeURIComponent(token)}`;
  const existing = await db.query.customers.findFirst({ where: eq(customers.email, email), columns: { id: true } });
  await sendEmail({
    ...signInEmail({ locale: input.locale, link, code, minutes: TOKEN_MINUTES }),
    to: email,
    type: "sign_in",
    idempotencyKey: `sign-in/${id}`,
    customerId: existing?.id ?? null,
  });
  // Whether or not the send succeeded, the caller sees "check your email" (no enumeration); failures are in notification_log.
  return { ok: true };
}

// ---------------------------------------------------------------- link

export type LinkError = "invalid" | "expired";

/** What a link is for, without spending it: drives the confirmation page. */
export async function peekLink(token: string): Promise<{ ok: true; email: string; maskedEmail: string; locale: Locale; next: string } | { ok: false; error: LinkError }> {
  if (!token || token.length > 128) return { ok: false, error: "invalid" };
  const row = await getDb().query.authTokens.findFirst({ where: eq(authTokens.tokenHash, hashToken(token)) });
  if (!row) return { ok: false, error: "invalid" };
  if (row.usedAt || row.expiresAt <= new Date()) return { ok: false, error: "expired" };
  return { ok: true, email: row.email, maskedEmail: maskEmail(row.email), locale: row.locale, next: safeNext(row.next, `/${row.locale}`) };
}

export type VerifyResult =
  | { ok: true; sessionToken: string; next: string; locale: Locale; customerId: string }
  | { ok: false; error: LinkError | "locked" }
  /** The link is good but this browser didn't ask for it: show the confirmation page. */
  | { ok: false; error: "confirm"; maskedEmail: string; locale: Locale };

/**
 * Spend a link. `flowSecret` is this browser's flow cookie; `confirmed` means the
 * person pressed the button on the confirmation page (same-origin POST).
 */
export async function redeemLink(token: string, opts: { flowSecret?: string | null; confirmed?: boolean }): Promise<VerifyResult> {
  if (!token || token.length > 128) return { ok: false, error: "invalid" };
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(authTokens).where(eq(authTokens.tokenHash, hashToken(token))).for("update");
    if (!row) return { ok: false as const, error: "invalid" as const };
    if (row.usedAt || row.expiresAt <= new Date()) return { ok: false as const, error: "expired" as const };
    if (!opts.confirmed && !flowMatches(opts.flowSecret, row.flowHash)) {
      return { ok: false as const, error: "confirm" as const, maskedEmail: maskEmail(row.email), locale: row.locale };
    }
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
    return complete(tx, row.email, row.locale, row.next);
  });
}

// ---------------------------------------------------------------- code

/** The code, typed into the screen that asked for it: newest live token for the address, same browser only. */
export async function verifyCode(emailIn: string, codeIn: string, flowSecret: string | null | undefined): Promise<VerifyResult> {
  const email = normaliseEmail(emailIn);
  const code = (codeIn ?? "").replace(/\D/g, "");
  if (!EMAIL.test(email) || code.length !== CODE_LENGTH) return { ok: false, error: "invalid" };
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.email, email), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
      .orderBy(desc(authTokens.createdAt))
      .limit(1)
      .for("update");
    if (!row || !flowMatches(flowSecret, row.flowHash)) return { ok: false as const, error: "expired" as const };
    if (row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false as const, error: "locked" as const };
    if (!codeMatches(row.id, code, row.codeHash)) {
      const attempts = row.attempts + 1;
      await tx.update(authTokens).set({ attempts }).where(eq(authTokens.id, row.id));
      return { ok: false as const, error: attempts >= MAX_CODE_ATTEMPTS ? ("locked" as const) : ("invalid" as const) };
    }
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
    return complete(tx, row.email, row.locale, row.next);
  });
}

async function complete(tx: Conn, email: string, locale: Locale, next: string | null) {
  const customerId = await signIn(tx, email, locale);
  const sessionToken = await createSession(tx, customerId);
  return { ok: true as const, sessionToken, next: safeNext(next, `/${locale}`), locale, customerId };
}

/**
 * First verified sign-in creates the account; a notify-me subscriber converts and
 * keeps their choice (PRD 2.1, 2.7). Conflict-safe: two links for the same new
 * address verified at once yield one customer and two sessions.
 */
export async function signIn(tx: Conn, email: string, locale: Locale): Promise<string> {
  const now = new Date();
  const sub = await tx.query.subscribers.findFirst({ where: eq(subscribers.email, email) });
  const [inserted] = await tx
    .insert(customers)
    .values({ email, locale, emailVerifiedAt: now, marketingOptIn: sub ? !sub.unsubscribedAt : true })
    .onConflictDoNothing({ target: customers.email })
    .returning({ id: customers.id });
  let customerId = inserted?.id;
  if (!customerId) {
    // Someone else won the insert, or the account already existed: keep its profile and preferences, just mark it verified.
    const existing = await tx.query.customers.findFirst({ where: eq(customers.email, email), columns: { id: true, emailVerifiedAt: true } });
    if (!existing) throw new Error("customer vanished during sign-in");
    customerId = existing.id;
    if (!existing.emailVerifiedAt) await tx.update(customers).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(customers.id, customerId));
  }
  if (sub && !sub.convertedCustomerId) {
    await tx.update(subscribers).set({ convertedCustomerId: customerId, updatedAt: now }).where(eq(subscribers.id, sub.id));
  }
  return customerId;
}

export async function createSession(tx: Conn, customerId: string): Promise<string> {
  const token = generateToken();
  await tx.insert(sessions).values({ customerId, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) });
  return token;
}

// ---------------------------------------------------------------- session

export interface CurrentCustomer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  locale: Locale;
  marketingOptIn: boolean;
  role: "customer" | "admin";
  address: { postalCode: string; prefecture: string; city: string; town: string | null; line1: string; line2: string | null } | null;
}

/** The customer behind a session token, or null. Exposed for the request-scoped wrapper and tests. */
export async function customerForSession(token: string | null): Promise<CurrentCustomer | null> {
  if (!token) return null;
  const db = getDb();
  const now = new Date();
  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.tokenHash, hashSession(token)), gt(sessions.expiresAt, now)),
    with: { customer: { with: { address: true } } },
  });
  if (!row || row.customer.deletedAt) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > DAY) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
  }
  const c = row.customer;
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    phone: c.phone,
    locale: c.locale,
    marketingOptIn: c.marketingOptIn,
    role: c.role,
    address: c.address
      ? { postalCode: c.address.postalCode, prefecture: c.address.prefecture, city: c.address.city, town: c.address.town, line1: c.address.line1, line2: c.address.line2 }
      : null,
  };
}

/** The signed-in customer for this request (server components and actions). */
export async function currentCustomer(): Promise<CurrentCustomer | null> {
  return customerForSession(await readSessionToken());
}

/** Ends the session behind a token; the caller clears the cookie. */
export async function endSession(token: string | null) {
  if (!token) return;
  await getDb().delete(sessions).where(eq(sessions.tokenHash, hashSession(token)));
}
