// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { signIn } from "@/lib/auth";
import { lockEmail } from "@/lib/email-lock";
import { hashIp } from "@/lib/auth-rules";
import { deliverWelcome, retryPendingWelcomes, SIGNUPS_PER_IP_PER_HOUR, subscribe, WELCOME_MAX_ATTEMPTS } from "@/lib/subscribe";
import { unsubscribe, verifyUnsubscribe } from "@/lib/unsubscribe";
import { captureEmail, clearTestData, closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

/** Notify-me signups (PRD 1.5) against a real Postgres (TEST_DATABASE_URL). */
// Room for a held transaction, a second one, and the lock-queue polling below at the same time.
const { pool, db } = testDb(4);
// Failed sends are captured too, so a test can see each attempt and its idempotency key.
const mail = captureEmail({ recordFailures: true });
const welcomes = () => mail.sent.filter((m) => m.type === "welcome");
const MIN = 60_000;

/**
 * The race tests arrange their ordering by what Postgres reports, not by timers: they wait until a backend is
 * actually queued on a lock (pg_locks, not granted), or until a promise has settled, so the steps don't depend
 * on how fast CI happens to be.
 */
async function until(ready: () => Promise<boolean> | boolean, what: string, ms = 5_000) {
  const deadline = Date.now() + ms;
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
/** How many backends are queued on an advisory lock, on the subscribers table, or on any lock (row and transaction waits have no database in pg_locks). */
async function waiting(on: "advisory" | "subscribers" | "any"): Promise<number> {
  const where = on === "advisory" ? sql`locktype = 'advisory'` : on === "subscribers" ? sql`locktype = 'relation' and relation = 'subscribers'::regclass` : sql`true`;
  const r = await db.execute(sql`select count(*)::int as n from pg_locks where not granted and (database is null or database = (select oid from pg_database where datname = current_database())) and ${where}`);
  return Number((r.rows[0] as { n: number }).n);
}
/** A promise plus whether it has settled yet. */
function track<T>(p: Promise<T>) {
  const s = { done: false, promise: p };
  p.finally(() => { s.done = true; }).catch(() => {});
  return s;
}
/** A transaction that runs `hold`, reports when it has, then stays open until released. */
function holdOpen(hold: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>) {
  let held!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => { held = r; });
  const gate = new Promise<void>((r) => { release = r; });
  const done = db.transaction(async (tx) => { await hold(tx); held(); await gate; });
  return { ready, release, done };
}
/** Both records for an address, to check they agree about consent. */
async function records(email: string) {
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.email, email));
  const [subscriber] = await db.select().from(schema.subscribers).where(eq(schema.subscribers.email, email));
  return { customer, subscriber };
}
/** The invariant both races used to break: once an account exists, any subscriber row is linked to it and agrees with its opt-in. */
function expectConsistent({ customer, subscriber }: Awaited<ReturnType<typeof records>>) {
  expect(customer).toBeDefined();
  if (!subscriber) return;
  expect(subscriber.convertedCustomerId).toBe(customer.id);
  expect(subscriber.unsubscribedAt === null).toBe(customer.marketingOptIn);
}
const row = async (email: string) => (await db.select().from(schema.subscribers).where(eq(schema.subscribers.email, email)))[0];

describe.skipIf(!TEST_DATABASE_URL)("subscribe", () => {
  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    mail.reset();
    await clearTestData(db, ["subscribers", "signup_attempts", "notification_log"]);
  });
  afterAll(async () => {
    await clearTestData(db, ["subscribers"]);
    await closeTestDb(pool);
  });

  it("stores the signup with its language, source and consent time, normalising the address", async () => {
    const at = new Date("2026-10-21T03:00:00Z");
    expect(await subscribe({ email: "  Hanako@Test.Invalid ", locale: "ja" }, { now: at })).toEqual({ ok: true });
    expect(await row("hanako@test.invalid")).toMatchObject({ locale: "ja", source: "homepage", consentedAt: at, unsubscribedAt: null, convertedCustomerId: null });
  });

  it("keeps one row per email, refreshing consent and language, and brings back an address that unsubscribed", async () => {
    await subscribe({ email: "again@test.invalid", locale: "en" }, { now: new Date("2026-10-01T00:00:00Z") });
    await db.update(schema.subscribers).set({ unsubscribedAt: new Date("2026-10-05T00:00:00Z") }).where(eq(schema.subscribers.email, "again@test.invalid"));
    const later = new Date("2026-10-21T00:00:00Z");
    expect(await subscribe({ email: "AGAIN@test.invalid", locale: "ja" }, { now: later })).toEqual({ ok: true });
    const rows = await db.select().from(schema.subscribers);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ locale: "ja", consentedAt: later, unsubscribedAt: null, source: "homepage" });
  });

  it("leaves a customer's own preference alone and answers the same way", async () => {
    await db.insert(schema.customers).values({ email: "member@test.invalid", marketingOptIn: false });
    expect(await subscribe({ email: "member@test.invalid", locale: "en" })).toEqual({ ok: true });
    expect(await row("member@test.invalid")).toBeUndefined();
    const [c] = await db.select().from(schema.customers).where(eq(schema.customers.email, "member@test.invalid"));
    expect(c.marketingOptIn).toBe(false);
  });

  it("rejects an address that isn't one, and stores nothing for a bot that fills the honeypot", async () => {
    for (const email of ["", "not-an-email", "a@b", "two words@test.invalid", `${"x".repeat(250)}@test.invalid`]) {
      expect(await subscribe({ email, locale: "en" })).toEqual({ ok: false, error: "invalid" });
    }
    expect(await subscribe({ email: "bot@test.invalid", locale: "en", website: "http://spam.example" })).toEqual({ ok: true });
    expect(await db.select().from(schema.subscribers)).toHaveLength(0);
  });

  it("waits for a first sign-in that is converting the same address, so the account and the subscriber agree", async () => {
    const email = "race-a@test.invalid";
    await subscribe({ email, locale: "en" });
    await db.update(schema.subscribers).set({ unsubscribedAt: new Date() }).where(eq(schema.subscribers.email, email));
    let signup!: ReturnType<typeof track<Awaited<ReturnType<typeof subscribe>>>>;
    await db.transaction(async (tx) => {
      await signIn(tx as never, email, "en"); // has read the unsubscribed row; the customer isn't committed yet
      signup = track(subscribe({ email, locale: "en" }));
      // With the email lock it queues there; any lock wait (or finishing) is enough to move on, and the final state decides.
      await until(async () => signup.done || (await waiting("any")) > 0, "the signup to queue or finish");
      expect(signup.done).toBe(false); // it can't finish until the sign-in commits
    });
    expect(await signup.promise).toEqual({ ok: true });
    const r = await records(email);
    expectConsistent(r);
    expect(r.customer.marketingOptIn).toBe(false); // the account's own preference governs from here
  });

  it("doesn't let a signup that found no account land beside one created a moment later", async () => {
    const email = "race-b@test.invalid";
    // A SHARE lock on subscribers lets reads through but holds the signup's INSERT, pausing it after its customer check.
    const holder = holdOpen((tx) => tx.execute(sql`lock table subscribers in share mode`));
    await holder.ready;
    const signup = track(subscribe({ email, locale: "ja" }));
    let signin!: ReturnType<typeof track<string>>;
    try {
      await until(async () => (await waiting("subscribers")) > 0, "the signup's insert to be held");
      // Without the shared email lock this sign-in would commit now, before the signup's insert.
      signin = track(db.transaction((tx) => signIn(tx as never, email, "ja")));
      await until(async () => signin.done || (await waiting("advisory")) > 0, "the sign-in to queue on the lock or finish");
    } finally {
      holder.release(); // even when a step above fails, so the suite's cleanup isn't left waiting
      await holder.done;
    }
    await Promise.all([signup.promise, signin.promise]);
    expectConsistent(await records(email));
  });

  it("serialises a signup and a first sign-in for a new address whichever reaches the lock first", async () => {
    const email = "race-c@test.invalid";
    const holder = holdOpen((tx) => lockEmail(tx as never, email));
    await holder.ready;
    const signup = track(subscribe({ email, locale: "ja" }));
    const signin = track(db.transaction((tx) => signIn(tx as never, email, "ja")));
    let bothQueued = false;
    try {
      await until(async () => (signup.done && signin.done) || (await waiting("advisory")) >= 2, "both to queue on the lock or finish");
      bothQueued = !signup.done && !signin.done;
    } finally {
      holder.release();
      await holder.done;
    }
    await Promise.all([signup.promise, signin.promise]);
    expect(bothQueued).toBe(true); // both waited behind the holder
    expectConsistent(await records(email));
  });

  it("welcomes a new address once, in its language, with a one-click way out that works", async () => {
    expect(await subscribe({ email: "new@test.invalid", locale: "ja" })).toEqual({ ok: true });
    expect(welcomes()).toHaveLength(1);
    const m = welcomes()[0];
    expect(m.to).toBe("new@test.invalid");
    expect(m.subject).toContain("登録しました");
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const oneClick = new URL(m.headers!["List-Unsubscribe"].slice(1, -1));
    expect(oneClick.pathname).toBe("/api/unsubscribe");
    expect(verifyUnsubscribe(oneClick.searchParams.get("e"), oneClick.searchParams.get("t"))).toBe("new@test.invalid");
    const page = new URL(m.text.match(/https:\/\/\S+\/ja\/unsubscribe\?\S+/)![0]);
    expect(verifyUnsubscribe(page.searchParams.get("e"), page.searchParams.get("t"))).toBe("new@test.invalid");
    expect(m.text).toContain("お心当たりがない場合");
  });

  it("doesn't welcome an address that's already on the list, but does welcome one coming back after unsubscribing", async () => {
    await subscribe({ email: "twice@test.invalid", locale: "en" });
    await subscribe({ email: "twice@test.invalid", locale: "en" });
    expect(welcomes()).toHaveLength(1);
    await unsubscribe("twice@test.invalid");
    await subscribe({ email: "Twice@test.invalid", locale: "en" });
    expect(welcomes()).toHaveLength(2);
    expect(new Set(welcomes().map((m) => m.idempotencyKey)).size).toBe(2);
  });

  it("sends nothing for a customer's address or a bot", async () => {
    await db.insert(schema.customers).values({ email: "acct@test.invalid", marketingOptIn: true });
    await subscribe({ email: "acct@test.invalid", locale: "en" });
    await subscribe({ email: "bot2@test.invalid", locale: "en", website: "x" });
    expect(mail.sent).toHaveLength(0);
  });

  it("won't send a welcome without a way out: no secret on Vercel means no email, though the sign-up is kept", async () => {
    const saved = { secret: process.env.UNSUBSCRIBE_SECRET, vercel: process.env.VERCEL_ENV };
    delete process.env.UNSUBSCRIBE_SECRET;
    process.env.VERCEL_ENV = "preview";
    try {
      expect(await subscribe({ email: "nosecret@test.invalid", locale: "en" })).toEqual({ ok: true });
      expect(mail.sent).toHaveLength(0);
      // Still owed, and no attempt used up, so the retry can send it once the secret is set.
      expect(await row("nosecret@test.invalid")).toMatchObject({ welcomeSentAt: null, welcomeAttempts: 0 });
      expect((await row("nosecret@test.invalid")).welcomeRequestedAt).not.toBeNull();
    } finally {
      if (saved.secret === undefined) delete process.env.UNSUBSCRIBE_SECRET; else process.env.UNSUBSCRIBE_SECRET = saved.secret;
      if (saved.vercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved.vercel;
    }
  });

  it("limits sign-ups per visitor per hour, counting only that visitor and only the last hour, and stores only a hash", async () => {
    const t0 = new Date("2026-10-21T10:00:00Z");
    for (let i = 0; i < SIGNUPS_PER_IP_PER_HOUR; i++) {
      expect(await subscribe({ email: `n${i}@test.invalid`, locale: "en" }, { ip: "203.0.113.7", now: t0 })).toEqual({ ok: true });
    }
    expect(await subscribe({ email: "one-more@test.invalid", locale: "en" }, { ip: "203.0.113.7", now: t0 })).toEqual({ ok: false, error: "rate_limited" });
    expect(await row("one-more@test.invalid")).toBeUndefined();
    expect(await subscribe({ email: "elsewhere@test.invalid", locale: "en" }, { ip: "198.51.100.2", now: t0 })).toEqual({ ok: true });
    expect(await subscribe({ email: "later@test.invalid", locale: "en" }, { ip: "203.0.113.7", now: new Date(t0.getTime() + 61 * 60_000) })).toEqual({ ok: true });
    const stored = await row("n0@test.invalid");
    expect(stored.consentIpHash).toBe(hashIp("203.0.113.7"));
    expect(stored.consentIpHash).not.toContain("203.0.113.7");
    for (let i = 0; i < SIGNUPS_PER_IP_PER_HOUR + 2; i++) {
      expect(await subscribe({ email: `local${i}@test.invalid`, locale: "en" }, { now: t0 })).toEqual({ ok: true }); // no IP (local dev): no limit
    }
  });

  it("unsubscribes a subscriber, a customer or both, by any spelling of the address, and repeating it is harmless", async () => {
    await subscribe({ email: "sub@test.invalid", locale: "en" });
    await db.insert(schema.customers).values([{ email: "cust@test.invalid", marketingOptIn: true }, { email: "both@test.invalid", marketingOptIn: true }]);
    await db.insert(schema.subscribers).values({ email: "both@test.invalid" });
    expect(await unsubscribe(" SUB@test.invalid ")).toEqual({ subscriber: true, customer: false });
    expect(await unsubscribe("cust@test.invalid")).toEqual({ subscriber: false, customer: true });
    expect(await unsubscribe("both@test.invalid")).toEqual({ subscriber: true, customer: true });
    expect(await unsubscribe("both@test.invalid")).toEqual({ subscriber: false, customer: false });
    expect(await unsubscribe("nobody@test.invalid")).toEqual({ subscriber: false, customer: false });
    expect((await row("sub@test.invalid")).unsubscribedAt).not.toBeNull();
    const [c] = await db.select().from(schema.customers).where(eq(schema.customers.email, "cust@test.invalid"));
    expect(c.marketingOptIn).toBe(false);
  });

  it("costs the visitor's allowance the same whether the address belongs to a customer or not", async () => {
    await db.insert(schema.customers).values({ email: "known@test.invalid", marketingOptIn: true });
    const run = async (ip: string, target: string) => {
      const t0 = new Date("2026-10-21T12:00:00Z");
      for (let i = 0; i < SIGNUPS_PER_IP_PER_HOUR - 1; i++) await subscribe({ email: `${ip}-${i}@test.invalid`, locale: "en" }, { ip, now: t0 });
      const forTarget = await subscribe({ email: target, locale: "en" }, { ip, now: t0 });
      const next = await subscribe({ email: `${ip}-next@test.invalid`, locale: "en" }, { ip, now: t0 });
      return [forTarget, next];
    };
    const customerCase = await run("192.0.2.1", "known@test.invalid");
    const newCase = await run("192.0.2.2", "unknown@test.invalid");
    expect(customerCase).toEqual(newCase);
    expect(customerCase).toEqual([{ ok: true }, { ok: false, error: "rate_limited" }]);
  });

  it("lets exactly the allowance through when one visitor's sign-ups arrive all at once", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => subscribe({ email: `burst${i}@test.invalid`, locale: "en" }, { ip: "192.0.2.50" })));
    expect(results.filter((r) => r.ok)).toHaveLength(SIGNUPS_PER_IP_PER_HOUR);
    expect(results.filter((r) => !r.ok)).toHaveLength(20 - SIGNUPS_PER_IP_PER_HOUR);
  });

  it("sends a welcome that failed when the person signs up again, once, under the same key", async () => {
    mail.failing = "provider down";
    expect(await subscribe({ email: "flaky@test.invalid", locale: "en" })).toEqual({ ok: true });
    expect(await row("flaky@test.invalid")).toMatchObject({ welcomeSentAt: null, welcomeAttempts: 1 });
    mail.failing = null;
    await subscribe({ email: "flaky@test.invalid", locale: "en" });
    expect(welcomes()).toHaveLength(2); // the failed try and the delivered one
    expect(welcomes()[0].idempotencyKey).toBe(welcomes()[1].idempotencyKey);
    expect((await row("flaky@test.invalid")).welcomeSentAt).not.toBeNull();
    await subscribe({ email: "flaky@test.invalid", locale: "en" });
    expect(await retryPendingWelcomes({ now: new Date(Date.now() + 2 * MIN) })).toEqual([]);
    expect(welcomes()).toHaveLength(2); // delivered once, never again
  });

  it("retries a failed welcome after a later sign-up, and sends a waiting one once the secret is set", async () => {
    mail.failing = "provider down";
    await subscribe({ email: "retry@test.invalid", locale: "en" });
    mail.failing = null;
    expect(await retryPendingWelcomes({ now: new Date(Date.now() + 2 * MIN) })).toEqual(["sent"]);

    const saved = { secret: process.env.UNSUBSCRIBE_SECRET, vercel: process.env.VERCEL_ENV };
    delete process.env.UNSUBSCRIBE_SECRET;
    process.env.VERCEL_ENV = "preview";
    try {
      await subscribe({ email: "waiting@test.invalid", locale: "ja" });
      expect(await retryPendingWelcomes({ now: new Date(Date.now() + 2 * MIN) })).toEqual(["no_secret"]);
      process.env.UNSUBSCRIBE_SECRET = "z".repeat(40); // the configuration is fixed
      expect(await retryPendingWelcomes({ now: new Date(Date.now() + 2 * MIN) })).toEqual(["sent"]);
    } finally {
      if (saved.secret === undefined) delete process.env.UNSUBSCRIBE_SECRET; else process.env.UNSUBSCRIBE_SECRET = saved.secret;
      if (saved.vercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved.vercel;
    }
    expect(welcomes().map((m) => m.to)).toEqual(["retry@test.invalid", "retry@test.invalid", "waiting@test.invalid"]);
  });

  it("doesn't send a pending welcome to someone who unsubscribed meanwhile, and gives up after the cap", async () => {
    mail.failing = "provider down";
    await subscribe({ email: "left@test.invalid", locale: "en" });
    await unsubscribe("left@test.invalid");
    mail.failing = null;
    expect(await retryPendingWelcomes({ now: new Date(Date.now() + 2 * MIN) })).toEqual([]);
    expect(await deliverWelcome((await row("left@test.invalid")).id)).toBe("not_owed");
    expect(welcomes().filter((m) => m.to === "left@test.invalid")).toHaveLength(1); // only the original failed try

    mail.failing = "still down";
    await subscribe({ email: "never@test.invalid", locale: "en" });
    for (let i = 1; i < WELCOME_MAX_ATTEMPTS; i++) await retryPendingWelcomes({ now: new Date(Date.now() + 2 * MIN) });
    expect(await row("never@test.invalid")).toMatchObject({ welcomeAttempts: WELCOME_MAX_ATTEMPTS, welcomeSentAt: null });
    mail.failing = null;
    expect(await retryPendingWelcomes({ now: new Date(Date.now() + 2 * MIN) })).toEqual([]);
    expect(await deliverWelcome((await row("never@test.invalid")).id)).toBe("gave_up");
  });

  it("keeps both records opted out and linked when unsubscribing races a first sign-in", async () => {
    const emails = Array.from({ length: 10 }, (_, i) => `racer${i}@test.invalid`);
    for (const email of emails) await subscribe({ email, locale: "en" });
    await Promise.all(emails.flatMap((email) => [unsubscribe(email), db.transaction((tx) => signIn(tx as never, email, "en"))]));
    for (const email of emails) {
      const r = await records(email);
      expectConsistent(r);
      expect(r.customer.marketingOptIn).toBe(false);
      expect(r.subscriber.unsubscribedAt).not.toBeNull();
    }
  });
});
