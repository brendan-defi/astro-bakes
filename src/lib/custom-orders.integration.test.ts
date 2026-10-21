// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { submitCustomOrder, type CustomOrderSubmission } from "@/lib/custom-orders";
import { RATE_PER_EMAIL, RATE_PER_IP } from "@/lib/custom-order-rules";
import { captureEmail, closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

/** The custom-orders write path against a real Postgres (TEST_DATABASE_URL), with the email transport captured. */
const { pool, db } = testDb();
const mail = captureEmail();
const sent = mail.sent;

const NOW = new Date("2026-10-20T03:00:00Z");
const input = (over: Partial<CustomOrderSubmission> = {}): CustomOrderSubmission => ({
  name: "Hanako", email: "hanako@test.invalid", eventDate: "2026-11-14", partySize: "20to50", packaging: "sealed", occasion: "birthday", details: "40 cookies, please.", locale: "ja", ...over,
});
const rows = () => db.select().from(schema.customOrderRequests);

describe.skipIf(!TEST_DATABASE_URL)("custom orders", () => {
  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    mail.reset();
    await db.execute(sql`truncate custom_order_requests, notification_log`);
    await db.execute(sql`delete from settings where key = 'custom_order_email'`);
  });
  afterAll(async () => {
    await closeTestDb(pool);
  });

  it("stores the request and emails the owner, with replies going to the customer", async () => {
    expect(await submitCustomOrder(input({ email: " Hanako@Test.Invalid " }), { ip: "203.0.113.7", now: NOW })).toEqual({ ok: true });
    const [row] = await rows();
    expect(row).toMatchObject({ name: "Hanako", email: "hanako@test.invalid", locale: "ja", eventDate: "2026-11-14", partySize: "20to50", packaging: "sealed", occasion: "birthday", details: "40 cookies, please." });
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.notifiedAt).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "hello@astrobakes.xyz", replyTo: "hanako@test.invalid", type: "custom_order_request", idempotencyKey: `custom-order/${row.id}` });
    expect(sent[0].text).toContain("Wrote in: Japanese");
    expect(sent[0].text).toContain("Notice: 25 days\n");
    expect(sent[0].text).toContain("Packaging: Individually sealed");
  });

  it("sends to the custom_order_email setting when there is one", async () => {
    await db.insert(schema.settings).values({ key: "custom_order_email", value: "owner@test.invalid" });
    await submitCustomOrder(input(), { now: NOW });
    expect(sent[0].to).toBe("owner@test.invalid");
  });

  it("keeps the request when the email fails, marked as not notified", async () => {
    mail.failing = "boom";
    expect(await submitCustomOrder(input(), { now: NOW })).toEqual({ ok: true });
    const [row] = await rows();
    expect(row.notifiedAt).toBeNull();
    const [log] = await db.select().from(schema.notificationLog);
    expect(log).toMatchObject({ type: "custom_order_request", error: "boom" });
  });

  it("rejects invalid input without storing or sending anything", async () => {
    expect(await submitCustomOrder(input({ eventDate: "2026-10-20", details: " " }), { now: NOW })).toEqual({ ok: false, error: "invalid", fields: ["eventDate", "details"] });
    expect(await rows()).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("answers a filled honeypot with a success, and stores and sends nothing", async () => {
    expect(await submitCustomOrder(input({ website: "https://spam.example" }), { now: NOW })).toEqual({ ok: true });
    expect(await rows()).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("limits requests per email per day, even when they arrive at once", async () => {
    const results = await Promise.all(Array.from({ length: RATE_PER_EMAIL + 2 }, () => submitCustomOrder(input(), { now: NOW })));
    expect(results.filter((r) => r.ok)).toHaveLength(RATE_PER_EMAIL);
    expect(results.filter((r) => !r.ok && r.error === "rate_limited")).toHaveLength(2);
    expect(await rows()).toHaveLength(RATE_PER_EMAIL);
    // A day later the allowance is back.
    expect(await submitCustomOrder(input(), { now: new Date(NOW.getTime() + 25 * 3_600_000) })).toEqual({ ok: true });
  });

  it("limits requests per IP across different emails", async () => {
    for (let i = 0; i < RATE_PER_IP; i++) expect((await submitCustomOrder(input({ email: `p${i}@test.invalid` }), { ip: "198.51.100.1", now: NOW })).ok).toBe(true);
    expect(await submitCustomOrder(input({ email: "another@test.invalid" }), { ip: "198.51.100.1", now: NOW })).toEqual({ ok: false, error: "rate_limited" });
    expect((await submitCustomOrder(input({ email: "another@test.invalid" }), { ip: "198.51.100.2", now: NOW })).ok).toBe(true);
  });
});
