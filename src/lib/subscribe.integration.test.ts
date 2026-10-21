// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { signIn } from "@/lib/auth";
import { lockEmail } from "@/lib/email-lock";
import { subscribe } from "@/lib/subscribe";
import { clearTestData, closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

/** Notify-me signups (PRD 1.5) against a real Postgres (TEST_DATABASE_URL). */
// Room for a held transaction, a second one, and the lock-queue polling below at the same time.
const { pool, db } = testDb(4);

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
    await clearTestData(db, ["subscribers"]);
  });
  afterAll(async () => {
    await clearTestData(db, ["subscribers"]);
    await closeTestDb(pool);
  });

  it("stores the signup with its language, source and consent time, normalising the address", async () => {
    const at = new Date("2026-10-21T03:00:00Z");
    expect(await subscribe({ email: "  Hanako@Test.Invalid ", locale: "ja" }, at)).toEqual({ ok: true });
    expect(await row("hanako@test.invalid")).toMatchObject({ locale: "ja", source: "homepage", consentedAt: at, unsubscribedAt: null, convertedCustomerId: null });
  });

  it("keeps one row per email, refreshing consent and language, and brings back an address that unsubscribed", async () => {
    await subscribe({ email: "again@test.invalid", locale: "en" }, new Date("2026-10-01T00:00:00Z"));
    await db.update(schema.subscribers).set({ unsubscribedAt: new Date("2026-10-05T00:00:00Z") }).where(eq(schema.subscribers.email, "again@test.invalid"));
    const later = new Date("2026-10-21T00:00:00Z");
    expect(await subscribe({ email: "AGAIN@test.invalid", locale: "ja" }, later)).toEqual({ ok: true });
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
});
