// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { customerForSession, redeemLink, requestSignIn, setCodeGenerator, verifyCode } from "@/lib/auth";
import { captureEmail, clearTestData, closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

/**
 * The admin portal's sign-in (PRD 5.4) against a real Postgres: the shop's
 * magic link + code with audience "admin". Codes are deterministic (the n-th
 * is n, zero-padded).
 */
const { pool, db } = testDb();
const mail = captureEmail();
let issued = 0;
const ORIGIN = "https://admin.preview.test";
const FLOW = "admin-browser-flow-secret";
const ADMIN = "owner@test.invalid";

const ask = (email: string, over: Partial<Parameters<typeof requestSignIn>[0]> = {}) =>
  requestSignIn({ email, locale: "en", origin: ORIGIN, ip: "203.0.113.20", flowSecret: FLOW, audience: "admin", ...over });
function last() {
  const m = mail.sent[mail.sent.length - 1];
  return { to: m.to, subject: m.subject, code: m.text.match(/code: (\d{6})/)![1], link: m.text.match(/https?:\/\/\S+/)![0], token: decodeURIComponent(m.text.match(/token=([A-Za-z0-9_%-]+)/)![1]) };
}
async function makeAdmin(email = ADMIN) {
  const [row] = await db.insert(schema.customers).values({ email, role: "admin", name: "Owner" }).returning({ id: schema.customers.id });
  return row.id;
}
const count = async (table: string) => Number((await db.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0].n);

describe.skipIf(!TEST_DATABASE_URL)("admin sign-in", () => {
  beforeAll(async () => {
    await resetDatabase(db);
    setCodeGenerator(() => String(++issued).padStart(6, "0"));
  });
  beforeEach(async () => {
    mail.reset();
    await clearTestData(db, ["order_items", "orders", "inventory_holds", "carts", "auth_tokens", "sessions", "notification_log"]);
  });
  afterAll(async () => {
    setCodeGenerator(null);
    await closeTestDb(pool);
  });

  it("emails an admin a code and an /admin link; anyone else gets the same answer and no email, and nothing is created", async () => {
    await makeAdmin();
    expect(await ask(ADMIN)).toEqual({ ok: true });
    const m = last();
    expect(m.to).toBe(ADMIN);
    expect(m.subject).toContain("admin sign-in code");
    expect(m.link).toMatch(new RegExp(`^${ORIGIN}/admin/auth/verify\\?token=`));

    const before = await count("customers");
    expect(await ask("stranger@test.invalid")).toEqual({ ok: true });
    expect(await ask("you@example.com")).toEqual({ ok: true }); // the seeded customer, not an admin
    expect(mail.sent).toHaveLength(1);
    expect(await count("customers")).toBe(before);
    // Those requests still count against the rate limits like any other.
    expect(await count("auth_tokens")).toBe(3);
  });

  it("the code opens an admin session that the shop doesn't accept, and returns inside /admin", async () => {
    const id = await makeAdmin();
    await ask(ADMIN, { next: "/admin/orders" });
    const r = await verifyCode(ADMIN, last().code, FLOW, "admin");
    expect(r).toMatchObject({ ok: true, customerId: id, next: "/admin/orders" });
    if (!r.ok) return;
    expect(await customerForSession(r.sessionToken, "admin")).toMatchObject({ id, role: "admin" });
    expect(await customerForSession(r.sessionToken)).toBeNull();
    const [session] = await db.select().from(schema.sessions);
    expect(session.audience).toBe("admin");
  });

  it("never returns an admin outside /admin", async () => {
    await makeAdmin();
    await ask(ADMIN, { next: "/en/account" });
    const r = await verifyCode(ADMIN, last().code, FLOW, "admin");
    expect(r.ok && r.next).toBe("/admin");
  });

  it("the link signs in only the browser that asked; another browser is told to use the code, and the link survives", async () => {
    await makeAdmin();
    await ask(ADMIN);
    const { token } = last();
    expect(await redeemLink(token, { flowSecret: "another-browser", audience: "admin" })).toMatchObject({ ok: false, error: "confirm" });
    const r = await redeemLink(token, { flowSecret: FLOW, audience: "admin" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(await customerForSession(r.sessionToken, "admin")).not.toBeNull();
  });

  it("keeps the two audiences apart: tokens, codes and sessions of one are refused by the other", async () => {
    await makeAdmin();
    // An admin link at the shop's verify route, and a shop link at the admin's.
    await ask(ADMIN);
    const admin = last();
    expect(await redeemLink(admin.token, { flowSecret: FLOW })).toEqual({ ok: false, error: "invalid" });
    await ask(ADMIN, { audience: "customer" });
    const shop = last();
    expect(await redeemLink(shop.token, { flowSecret: FLOW, audience: "admin" })).toEqual({ ok: false, error: "invalid" });
    // The shop's newer code doesn't hide the admin code, nor the reverse.
    expect(await verifyCode(ADMIN, shop.code, FLOW, "admin")).toEqual({ ok: false, error: "invalid" });
    const a = await verifyCode(ADMIN, admin.code, FLOW, "admin");
    const c = await verifyCode(ADMIN, shop.code, FLOW);
    expect(a.ok && c.ok).toBe(true);
    if (!a.ok || !c.ok) return;
    // A customer session is no admin session, even for the admin's own account.
    expect(await customerForSession(c.sessionToken, "admin")).toBeNull();
    expect(await customerForSession(c.sessionToken)).toMatchObject({ email: ADMIN });
  });

  it("refuses the code if the role was taken away after the email went out", async () => {
    const id = await makeAdmin();
    await ask(ADMIN);
    await db.update(schema.customers).set({ role: "customer" }).where(eq(schema.customers.id, id));
    expect(await verifyCode(ADMIN, last().code, FLOW, "admin")).toEqual({ ok: false, error: "invalid" });
    expect(await count("sessions")).toBe(0);
  });

  it("refuses a deleted admin account", async () => {
    const id = await makeAdmin();
    await db.update(schema.customers).set({ deletedAt: new Date() }).where(eq(schema.customers.id, id));
    expect(await ask(ADMIN)).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(0);
  });
});
