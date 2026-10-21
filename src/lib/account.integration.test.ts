// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { cancelOrder, changeTimeSlot, loadOrder, loadOrders, setMarketingOptIn, updateProfile } from "@/lib/account";
import { mergeQuantities } from "@/lib/cart";
import { placeOrder, startCheckout } from "@/lib/checkout";
import { captureEmail, clearTestData, closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

/** The account area against a real Postgres (TEST_DATABASE_URL), with the email transport captured. */
const { pool, db } = testDb();
const mail = captureEmail();
const sent = mail.sent;
const DROP = "drop-03";

async function customer(email: string, over: Partial<typeof schema.customers.$inferInsert> = {}): Promise<string> {
  const [row] = await db.insert(schema.customers).values({ email, emailVerifiedAt: new Date(), name: "Test Person", phone: "090-0000-0000", ...over }).returning({ id: schema.customers.id });
  return row.id;
}
/** Place a paid order for the customer through the real write path (demo "open" flag: the seeded drop is closed by the clock). */
async function order(customerId: string, items: Record<string, number> = { "cookie-box": 2, "banana-bread": 1 }): Promise<string> {
  const r = await startCheckout({ dropId: DROP, items, flags: { state: "open" } }, null);
  if (!r.ok || !r.checkoutId) throw new Error("expected holds");
  const p = await placeOrder({ dropId: DROP, checkoutId: r.checkoutId, revision: r.revision!, locale: "en", delivery: { name: "Test Person", phone: "090-0000-0000", postal: "153-0061", line1: "1-2-3", line2: "" }, gift: "Enjoy!", paymentMethod: "card" }, r.checkoutId, customerId);
  if (!p.ok) throw new Error("expected order: " + p.error);
  return p.order.number;
}
async function sold(slug: string) {
  const [row] = await db
    .select({ sold: schema.dropBoxes.soldQty })
    .from(schema.dropBoxes)
    .innerJoin(schema.boxes, eq(schema.dropBoxes.boxId, schema.boxes.id))
    .innerJoin(schema.drops, eq(schema.dropBoxes.dropId, schema.drops.id))
    .where(sql`${schema.drops.slug} = ${DROP} and ${schema.boxes.slug} = ${slug}`);
  return row.sold;
}
const setDrop = (state: "open" | "closed" | "baking" | "shipped", closeAt?: Date) => db.update(schema.drops).set({ state, ...(closeAt ? { closeAt } : {}) }).where(eq(schema.drops.slug, DROP));

describe.skipIf(!TEST_DATABASE_URL)("account", () => {
  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    mail.reset();
    await clearTestData(db, ["refunds", "order_items", "orders", "inventory_holds", "carts", "auth_tokens", "sessions", "notification_log"]);
    await seed(db);
  });
  afterAll(async () => {
    await clearTestData(db, ["refunds", "order_items", "orders", "inventory_holds", "carts"]);
    await closeTestDb(pool);
  });

  it("sends the confirmation email when an order is placed, with the terms and links (PRD 3.6)", async () => {
    const c = await customer("confirm@test.invalid");
    const number = await order(c);
    const m = sent.find((e) => e.type === "order_confirmation");
    expect(m).toBeDefined();
    expect(m!.to).toBe("confirm@test.invalid");
    expect(m!.subject).toContain(number);
    expect(m!.text).toContain("4 Cookie Box × 2");
    expect(m!.text).toContain("Total ¥2,500");
    expect(m!.text).toContain("Gift card: Enjoy!");
    expect(m!.text).toContain("until the drop closes");
    expect(m!.text).toContain(`/en/account/orders/${number}`);
    const [log] = await db.select().from(schema.notificationLog).where(eq(schema.notificationLog.type, "order_confirmation"));
    expect(log).toMatchObject({ to: "confirm@test.invalid", providerMessageId: "msg_1" });
  });

  it("lists a customer's orders newest first with the customer-facing status, scoped to them", async () => {
    const a = await customer("a@test.invalid");
    const b = await customer("b@test.invalid");
    const first = await order(a);
    const second = await order(a, { "banana-bread": 1 });
    await order(b);
    const mine = await loadOrders(a, "en");
    expect(mine.map((o) => o.number)).toEqual([second, first]);
    expect(mine[1]).toMatchObject({ status: "confirmed", total: 2500, dropName: "Drop 03 · October", canCancel: false }); // the seeded drop is closed by the clock
    expect(mine[1].lines).toEqual([
      { name: "4 Cookie Box", slug: "cookie-box", qty: 2, unitPrice: 1000, lineTotal: 2000 },
      { name: "Nebula Banana Bread", slug: "banana-bread", qty: 1, unitPrice: 500, lineTotal: 500 },
    ]);
    expect(await loadOrder(b, first, "en")).toBeNull(); // not theirs
    await setDrop("baking");
    expect((await loadOrders(a, "en"))[0].status).toBe("baking");
  });

  it("cancels while the drop is open: stock returned, refund recorded as owed, email sent", async () => {
    const c = await customer("cancel@test.invalid");
    const number = await order(c);
    expect(await sold("cookie-box")).toBe(15);
    await setDrop("open", new Date(Date.now() + 3_600_000));
    expect((await loadOrder(c, number, "en"))!.canCancel).toBe(true);
    expect(await cancelOrder(c, number)).toEqual({ ok: true, refunded: true });
    expect(await sold("cookie-box")).toBe(13);
    expect(await sold("banana-bread")).toBe(7);
    const detail = (await loadOrder(c, number, "en"))!;
    expect(detail).toMatchObject({ status: "cancelled", canCancel: false, refund: { amount: 2500, issued: false } });
    const m = sent.find((e) => e.type === "order_cancelled");
    expect(m!.to).toBe("cancel@test.invalid");
    expect(m!.text).toContain("¥2,500 is being refunded");
    // Second attempt: nothing to cancel any more, nothing double-refunded.
    expect(await cancelOrder(c, number)).toEqual({ ok: false, error: "not_cancellable" });
    expect(await db.select().from(schema.refunds)).toHaveLength(1);
    expect(await sold("cookie-box")).toBe(13);
  });

  it("refuses cancellation once the drop has closed, and for someone else's order (D22)", async () => {
    const c = await customer("late@test.invalid");
    const other = await customer("other@test.invalid");
    const number = await order(c);
    expect(await cancelOrder(c, number)).toEqual({ ok: false, error: "closed" }); // seeded drop: closed by the clock
    await setDrop("open", new Date(Date.now() + 3_600_000));
    expect(await cancelOrder(other, number)).toEqual({ ok: false, error: "not_found" });
    expect((await loadOrder(c, number, "en"))!.status).toBe("confirmed");
    expect(sent.filter((e) => e.type === "order_cancelled")).toHaveLength(0);
  });

  it("lets the customer change the delivery time slot until the drop closes, and only on their own order (D21)", async () => {
    const c = await customer("slot@test.invalid");
    const other = await customer("slot-other@test.invalid");
    const number = await order(c);
    expect(await changeTimeSlot(c, number, "morning")).toEqual({ ok: false, error: "closed" }); // seeded drop: closed by the clock
    expect((await loadOrder(c, number, "en"))!).toMatchObject({ timeSlot: "none", canChangeSlot: false });
    await setDrop("open", new Date(Date.now() + 3_600_000));
    expect((await loadOrder(c, number, "en"))!.canChangeSlot).toBe(true);
    expect(await changeTimeSlot(c, number, "18_20")).toEqual({ ok: true, slot: "18_20", changed: true });
    expect(await changeTimeSlot(c, number, "18_20")).toEqual({ ok: true, slot: "18_20", changed: false }); // no-op: nothing to revalidate
    expect((await loadOrder(c, number, "en"))!.timeSlot).toBe("18_20");
    expect(await changeTimeSlot(other, number, "morning")).toEqual({ ok: false, error: "not_found" });
    expect(await changeTimeSlot(c, number, "20_21")).toEqual({ ok: false, error: "invalid" });
    expect((await loadOrder(c, number, "en"))!.timeSlot).toBe("18_20");
    await cancelOrder(c, number);
    expect(await changeTimeSlot(c, number, "morning")).toEqual({ ok: false, error: "not_changeable" });
  });

  it("offers 'order again' only when the open drop carries the same boxes", async () => {
    const c = await customer("again@test.invalid");
    const number = await order(c, { "cookie-box": 1 });
    expect((await loadOrder(c, number, "en"))!.reorder).toBeNull(); // nothing open by the clock
    await setDrop("open", new Date(Date.now() + 3_600_000));
    const reorder = (await loadOrder(c, number, "en"))!.reorder;
    expect(reorder).toMatchObject({ dropId: DROP, items: { "cookie-box": 1 } });
    expect(reorder!.boxes.map((b) => b.id)).toEqual(["cookie-box", "banana-bread", "sampler-box"]);
  });

  it("'order again' doesn't count the viewer's own reservation against them, like the homepage and checkout", async () => {
    const c = await customer("reserved@test.invalid");
    const number = await order(c, { "cookie-box": 1 }); // seeded 13 sold + 1 = 14 of 20, so 6 left
    await setDrop("open", new Date(Date.now() + 3_600_000));
    const mine = await startCheckout({ dropId: DROP, items: { "cookie-box": 5 }, flags: { state: "open" } }, null); // this browser's cart holds 5
    if (!mine.ok || !mine.checkoutId) throw new Error("expected holds");
    const cookiesLeft = async (cartId: string | null) => (await loadOrder(c, number, "en", cartId))!.reorder!.boxes.find((b) => b.id === "cookie-box")!.left;
    expect(await cookiesLeft(null)).toBe(1); // another browser sees the 5 reserved
    expect(await cookiesLeft(mine.checkoutId)).toBe(6); // the reserving browser doesn't
    // So "Order again" tops that cart up to the per-customer limit rather than shrinking it to 1.
    const { boxes } = (await loadOrder(c, number, "en", mine.checkoutId))!.reorder!;
    expect(mergeQuantities({ "cookie-box": 5 }, { "cookie-box": 1 }, boxes)).toEqual({ "cookie-box": 5 });
  });

  it("updates the profile and saved address with the checkout's rules, and the preference", async () => {
    const c = await customer("profile@test.invalid");
    const bad = await updateProfile(c, { name: "", phone: "1", locale: "en", address: { name: "", phone: "1", postal: "180-0004", line1: "", line2: "" } });
    expect(bad).toEqual({ ok: false, error: "invalid", errors: ["name", "line1", "area"] });
    expect(await updateProfile(c, { name: "花子", phone: "090-1111-2222", locale: "ja", address: { name: "花子", phone: "090-1111-2222", postal: "１５０－０００１", line1: "5-6", line2: "" } })).toEqual({ ok: true });
    const me = await db.query.customers.findFirst({ where: eq(schema.customers.id, c), with: { address: true } });
    expect(me).toMatchObject({ name: "花子", phone: "090-1111-2222", locale: "ja", marketingOptIn: true, address: { postalCode: "1500001", city: "渋谷区", line1: "5-6", line2: null, wardCode: "13113" } });
    await setMarketingOptIn(c, false);
    expect((await db.query.customers.findFirst({ where: eq(schema.customers.id, c) }))!.marketingOptIn).toBe(false);
  });
});
