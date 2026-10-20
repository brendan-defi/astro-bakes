// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { closeDb } from "@/db";
import { seed } from "@/db/seed";
import { customerForSession, endSession, peekLink, redeemLink, requestSignIn, setCodeGenerator, verifyCode } from "@/lib/auth";
import { MAX_CODE_ATTEMPTS, RATE_PER_EMAIL, RATE_PER_IP } from "@/lib/auth-rules";
import { setEmailTransport, type OutgoingEmail } from "@/lib/email";

/**
 * Magic link + code sign-in against a real Postgres (TEST_DATABASE_URL), with
 * the email transport captured and codes made deterministic: the n-th code
 * issued is n, zero-padded, so "000000" is never valid and consecutive codes differ.
 */
const URL = process.env.TEST_DATABASE_URL;
if (URL) process.env.DATABASE_URL = URL;
const pool = URL ? new Pool({ connectionString: URL, max: 4 }) : null;
const db = pool ? drizzle(pool, { schema, casing: "snake_case" }) : null!;

const sent: OutgoingEmail[] = [];
let failSends = false;
let issued = 0;
const ORIGIN = "https://preview.test";
/** This browser's flow cookie; a different value stands for another browser. */
const FLOW = "browser-A-flow-secret";
const OTHER_FLOW = "browser-B-flow-secret";
const req = (email: string, over: Partial<Parameters<typeof requestSignIn>[0]> = {}) =>
  requestSignIn({ email, locale: "en", origin: ORIGIN, ip: "203.0.113.9", flowSecret: FLOW, ...over });
function last() {
  const m = sent[sent.length - 1];
  const code = m.text.match(/(?:code|コード): (\d{6})/)?.[1];
  const token = m.text.match(/token=([A-Za-z0-9_%-]+)/)?.[1];
  if (!code || !token) throw new Error("email without code or link");
  return { to: m.to, code, token: decodeURIComponent(token), link: m.text.match(/https?:\/\/\S+/)![0] };
}
const count = async (table: string) => Number((await db.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0].n);
const customersWith = (email: string) => db.select().from(schema.customers).where(eq(schema.customers.email, email));

describe.skipIf(!URL)("sign-in", () => {
  beforeAll(async () => {
    // A dedicated test database: start from nothing so regenerated migrations never collide with stale state.
    await db.execute(sql`drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade`);
    await migrate(db, { migrationsFolder: "drizzle" });
    await seed(db);
    setEmailTransport(async (email) => {
      sent.push(email);
      return failSends ? { ok: false, error: "simulated outage" } : { ok: true, providerMessageId: `msg_${sent.length}` };
    });
    setCodeGenerator(() => String(++issued).padStart(6, "0"));
  });
  beforeEach(async () => {
    sent.length = 0;
    failSends = false;
    // Orders from the checkout suite reference test customers; clear the write tables before the customers.
    await db.execute(sql`truncate order_items, orders, inventory_holds, carts, auth_tokens, sessions, notification_log cascade`);
    await db.execute(sql`delete from customers where email like '%@test.invalid'`);
    await db.execute(sql`delete from subscribers where email like '%@test.invalid'`);
  });
  afterAll(async () => {
    setEmailTransport(null);
    setCodeGenerator(null);
    await closeDb();
    await pool?.end();
  });

  it("sends one email with a link and a code, logs it, and answers the same for unknown and known addresses", async () => {
    expect(await req("New.Person@test.invalid")).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    const m = last();
    expect(m.to).toBe("new.person@test.invalid");
    expect(m.link).toMatch(new RegExp(`^${ORIGIN}/en/auth/verify\\?token=`));
    const [log] = await db.select().from(schema.notificationLog);
    expect(log).toMatchObject({ type: "sign_in", to: "new.person@test.invalid", providerMessageId: "msg_1", error: null });
    expect(await req("you@example.com")).toEqual({ ok: true }); // the seeded customer
    expect(await req("nope")).toEqual({ ok: false, error: "invalid_email" });
    expect(await req("x@test.invalid", { flowSecret: "" })).toEqual({ ok: false, error: "invalid_email" });
  });

  it("the requesting browser redeems the link silently, once; it creates a verified customer and a session", async () => {
    await req("link@test.invalid", { next: "/en/checkout?step=delivery&r=abc" });
    const { token } = last();
    expect(await peekLink(token)).toMatchObject({ ok: true, email: "link@test.invalid", maskedEmail: "l***@test.invalid", next: "/en/checkout?step=delivery&r=abc" });
    const r = await redeemLink(token, { flowSecret: FLOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next).toBe("/en/checkout?step=delivery&r=abc");
    expect(await customerForSession(r.sessionToken)).toMatchObject({ email: "link@test.invalid", locale: "en", marketingOptIn: true, role: "customer", address: null });
    expect((await customersWith("link@test.invalid"))[0].emailVerifiedAt).not.toBeNull();
    expect(await redeemLink(token, { flowSecret: FLOW })).toEqual({ ok: false, error: "expired" });
    expect(await peekLink(token)).toEqual({ ok: false, error: "expired" });
    expect(await redeemLink("not-a-token", { flowSecret: FLOW })).toEqual({ ok: false, error: "invalid" });
  });

  it("any other browser must confirm before the link signs it in; peeking never spends the link (login CSRF)", async () => {
    await req("cross@test.invalid");
    const { token } = last();
    // A victim's browser (different or no flow cookie) opening an attacker's link gets the confirmation page, nothing else.
    expect(await redeemLink(token, { flowSecret: OTHER_FLOW })).toEqual({ ok: false, error: "confirm", maskedEmail: "c***@test.invalid", locale: "en" });
    expect(await redeemLink(token, {})).toMatchObject({ ok: false, error: "confirm" });
    expect(await count("sessions")).toBe(0);
    expect(await customersWith("cross@test.invalid")).toHaveLength(0);
    expect(await peekLink(token)).toMatchObject({ ok: true }); // still live
    // Only an explicit confirmation (same-origin POST) establishes the session.
    const r = await redeemLink(token, { confirmed: true });
    expect(r.ok).toBe(true);
    expect(await count("sessions")).toBe(1);
    expect(await redeemLink(token, { confirmed: true })).toEqual({ ok: false, error: "expired" });
  });

  it("the code works from the requesting browser only, against the newest email, and locks after too many wrong tries", async () => {
    await req("code@test.invalid");
    const first = last();
    await req("code@test.invalid");
    const second = last();
    expect(first.code).not.toBe(second.code);
    expect(await verifyCode("code@test.invalid", second.code, OTHER_FLOW)).toEqual({ ok: false, error: "expired" }); // another browser
    expect(await verifyCode("code@test.invalid", first.code, FLOW)).toEqual({ ok: false, error: "invalid" }); // older code is not the live one
    for (let i = 1; i < MAX_CODE_ATTEMPTS; i++) {
      expect(await verifyCode("Code@Test.invalid", "000000", FLOW)).toEqual({ ok: false, error: i + 1 >= MAX_CODE_ATTEMPTS ? "locked" : "invalid" });
    }
    expect(await verifyCode("code@test.invalid", second.code, FLOW)).toEqual({ ok: false, error: "locked" });
    // the link of the locked token still works (it is a separate secret), once
    expect((await redeemLink(second.token, { flowSecret: FLOW })).ok).toBe(true);
  });

  it("the code works, spends the token, and the spent link is refused", async () => {
    await req("ok@test.invalid", { next: "//evil.example" });
    const { code, token } = last();
    const r = await verifyCode("ok@test.invalid", `${code.slice(0, 3)} ${code.slice(3)}`, FLOW);
    expect(r.ok && r.next).toBe("/en"); // unsafe next fell back
    expect(await redeemLink(token, { flowSecret: FLOW })).toEqual({ ok: false, error: "expired" });
    expect(await verifyCode("ok@test.invalid", code, FLOW)).toEqual({ ok: false, error: "expired" }); // nothing live any more
  });

  it("expired tokens are refused by every path", async () => {
    await req("late@test.invalid");
    const { code, token } = last();
    await db.update(schema.authTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await redeemLink(token, { flowSecret: FLOW })).toEqual({ ok: false, error: "expired" });
    expect(await redeemLink(token, { confirmed: true })).toEqual({ ok: false, error: "expired" });
    expect(await verifyCode("late@test.invalid", code, FLOW)).toEqual({ ok: false, error: "expired" });
  });

  it("rate-limits per email and per IP, sequentially and under concurrency (PRD 5.4)", async () => {
    for (let i = 0; i < RATE_PER_EMAIL; i++) expect(await req("busy@test.invalid")).toEqual({ ok: true });
    expect(await req("busy@test.invalid")).toEqual({ ok: false, error: "rate_limited" });
    expect(sent).toHaveLength(RATE_PER_EMAIL);
    for (let i = 0; i < RATE_PER_IP; i++) expect(await req(`ip${i}@test.invalid`, { ip: "198.51.100.7" })).toEqual({ ok: true });
    expect(await req("one-more@test.invalid", { ip: "198.51.100.7" })).toEqual({ ok: false, error: "rate_limited" });
    expect(await req("one-more@test.invalid", { ip: "198.51.100.8" })).toEqual({ ok: true });

    // Twenty simultaneous requests for one address: exactly the allowance gets through.
    sent.length = 0;
    const same = await Promise.all(Array.from({ length: 20 }, () => req("flood@test.invalid", { ip: "192.0.2.1" })));
    expect(same.filter((r) => r.ok)).toHaveLength(RATE_PER_EMAIL);
    expect(sent).toHaveLength(RATE_PER_EMAIL);
    // Twenty simultaneous requests for different addresses from one IP: exactly the IP allowance.
    sent.length = 0;
    const sameIp = await Promise.all(Array.from({ length: 20 }, (_, i) => req(`flood${i}@test.invalid`, { ip: "192.0.2.2" })));
    expect(sameIp.filter((r) => r.ok)).toHaveLength(RATE_PER_IP);
    expect(sent).toHaveLength(RATE_PER_IP);
  });

  it("two links for a brand-new address verified at once yield one customer and two sessions", async () => {
    await req("twice@test.invalid");
    const a = last();
    await req("twice@test.invalid");
    const b = last();
    const results = await Promise.all([redeemLink(a.token, { flowSecret: FLOW }), redeemLink(b.token, { flowSecret: FLOW })]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await customersWith("twice@test.invalid")).toHaveLength(1);
    expect(await count("sessions")).toBe(2);
  });

  it("converts a notify-me subscriber and keeps their choice (PRD 2.7)", async () => {
    await db.insert(schema.subscribers).values([
      { email: "fan@test.invalid", locale: "ja" },
      { email: "gone@test.invalid", unsubscribedAt: new Date() },
    ]);
    for (const email of ["fan@test.invalid", "gone@test.invalid"]) {
      await req(email, { locale: "ja" });
      expect((await redeemLink(last().token, { flowSecret: FLOW })).ok).toBe(true);
    }
    const fan = await db.query.subscribers.findFirst({ where: eq(schema.subscribers.email, "fan@test.invalid") });
    const [fanCustomer] = await customersWith("fan@test.invalid");
    expect(fan?.convertedCustomerId).toBe(fanCustomer.id);
    expect(fanCustomer).toMatchObject({ marketingOptIn: true, locale: "ja" });
    expect((await customersWith("gone@test.invalid"))[0].marketingOptIn).toBe(false);
  });

  it("verifies an existing customer in place, keeping profile and preferences", async () => {
    await db.insert(schema.customers).values({ email: "pre@test.invalid", name: "Pre Existing", marketingOptIn: false });
    await req("pre@test.invalid");
    expect((await verifyCode("pre@test.invalid", last().code, FLOW)).ok).toBe(true);
    const rows = await customersWith("pre@test.invalid");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Pre Existing", marketingOptIn: false });
    expect(rows[0].emailVerifiedAt).not.toBeNull();
  });

  it("sessions end on sign-out and on expiry", async () => {
    await req("session@test.invalid");
    const r = await redeemLink(last().token, { flowSecret: FLOW });
    if (!r.ok) throw new Error("expected sign-in");
    expect(await customerForSession(r.sessionToken)).not.toBeNull();
    await endSession(r.sessionToken);
    expect(await customerForSession(r.sessionToken)).toBeNull();
    await req("session@test.invalid");
    const again = await verifyCode("session@test.invalid", last().code, FLOW);
    if (!again.ok) throw new Error("expected sign-in");
    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await customerForSession(again.sessionToken)).toBeNull();
    expect(await customerForSession(null)).toBeNull();
  });

  it("still answers ok when the email provider fails, and records the failure", async () => {
    failSends = true;
    expect(await req("outage@test.invalid")).toEqual({ ok: true });
    const [log] = await db.select().from(schema.notificationLog);
    expect(log).toMatchObject({ type: "sign_in", to: "outage@test.invalid", providerMessageId: null, error: "simulated outage" });
    expect(await count("auth_tokens")).toBe(1);
  });
});
