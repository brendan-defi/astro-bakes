// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { signIn } from "@/lib/auth";
import { lockEmail } from "@/lib/email-lock";
import { subscribe } from "@/lib/subscribe";
import { clearTestData, closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

/** Notify-me signups (PRD 1.5) against a real Postgres (TEST_DATABASE_URL). */
const { pool, db } = testDb();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
    let signup!: Promise<unknown>;
    let settled = false;
    await db.transaction(async (tx) => {
      await signIn(tx as never, email, "en"); // has read the unsubscribed row; the customer isn't committed yet
      signup = subscribe({ email, locale: "en" }).finally(() => { settled = true; });
      await sleep(300);
      expect(settled).toBe(false); // held on the same lock until the sign-in commits
    });
    expect(await signup).toEqual({ ok: true });
    const r = await records(email);
    expectConsistent(r);
    expect(r.customer.marketingOptIn).toBe(false); // the account's own preference governs from here
  });

  it("doesn't let a signup that found no account land beside one created a moment later", async () => {
    const email = "race-b@test.invalid";
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    // A SHARE lock on subscribers lets reads through but holds the signup's INSERT, pausing it after its customer check.
    const holder = db.transaction(async (tx) => { await tx.execute(sql`lock table subscribers in share mode`); await gate; });
    await sleep(100);
    const signup = subscribe({ email, locale: "ja" });
    await sleep(150);
    const signin = db.transaction((tx) => signIn(tx as never, email, "ja")); // without the shared lock this commits first
    await sleep(300);
    release();
    await holder;
    await Promise.all([signup, signin]);
    expectConsistent(await records(email));
  });

  it("serialises a signup and a first sign-in for a new address whichever reaches the lock first", async () => {
    const email = "race-c@test.invalid";
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const holder = db.transaction(async (tx) => { await lockEmail(tx as never, email); await gate; });
    await sleep(100);
    const signup = subscribe({ email, locale: "ja" });
    const signin = db.transaction((tx) => signIn(tx as never, email, "ja"));
    await sleep(200);
    release();
    await holder;
    await Promise.all([signup, signin]);
    expectConsistent(await records(email));
  });
});
