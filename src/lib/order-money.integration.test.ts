// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { cancelDropAction, transitionDropAction } from "@/app/admin/(app)/drops/actions";
import { cancelOrderAction, refundOrderAction } from "@/app/admin/(app)/orders/actions";
import { cancelOrder, loadOrder } from "@/lib/account";
import { placeOrder, startCheckout } from "@/lib/checkout";
import { cancelDrop, cancelImpact } from "@/lib/drops-admin";
import { orderDetail } from "@/lib/orders-admin";
import { captureEmail, clearTestData, closeTestDb, resetDatabase, reseed, testDb, TEST_DATABASE_URL } from "@/test/db";

// The real actions, with only the admin check and Next's cache stubbed; redirect() throws as Next's does.
const admin = vi.hoisted(() => ({ id: "", email: "owner@test.invalid", name: "Owner" }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => admin }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); } }));

/** Cancelling and refunding (PRD 4.4, 4.2 Cancel drop, D22) against a real Postgres, orders placed through the real checkout. */
const { pool, db } = testDb(4);
const mail = captureEmail();
const DROP = "drop-03";
const TABLES = ["order_events", "refunds", "order_items", "orders", "inventory_holds", "carts", "notification_log"];

async function customer(email: string) {
  const [c] = await db.insert(schema.customers).values({ email, name: "Test Person", emailVerifiedAt: new Date() }).returning({ id: schema.customers.id });
  return c.id;
}
/** A paid order of 2 × 4 Cookie Box and 1 × Banana Bread (¥2,500) through the real checkout. */
async function checkout(locale: "en" | "ja" = "en") {
  const r = await startCheckout({ dropId: DROP, items: { "cookie-box": 2, "banana-bread": 1 }, flags: { state: "open" } }, null);
  if (!r.ok || !r.checkoutId) throw new Error("expected holds");
  return { checkoutId: r.checkoutId, revision: r.revision!, locale };
}
const place = (c: { checkoutId: string; revision: number; locale: "en" | "ja" }, customerId: string) =>
  placeOrder({ dropId: DROP, checkoutId: c.checkoutId, revision: c.revision, locale: c.locale, delivery: { name: "Test Person", phone: "090-0000-0000", postal: "153-0061", line1: "1-2-3", line2: "" }, gift: null, paymentMethod: "card" }, c.checkoutId, customerId);
async function order(customerId: string, locale: "en" | "ja" = "en") {
  const p = await place(await checkout(locale), customerId);
  if (!p.ok) throw new Error("expected an order: " + p.error);
  return p.order.number;
}
async function sold(slug: string) {
  const [row] = await db.select({ sold: schema.dropBoxes.soldQty }).from(schema.dropBoxes).innerJoin(schema.boxes, eq(schema.dropBoxes.boxId, schema.boxes.id)).innerJoin(schema.drops, eq(schema.dropBoxes.dropId, schema.drops.id)).where(sql`${schema.drops.slug} = ${DROP} and ${schema.boxes.slug} = ${slug}`);
  return row.sold;
}
const setDrop = (state: "open" | "closed" | "baking", closeAt?: Date) => db.update(schema.drops).set({ state, ...(closeAt ? { closeAt } : {}) }).where(eq(schema.drops.slug, DROP));
const openDrop = () => setDrop("open", new Date(Date.now() + 3_600_000));
const setOrder = (number: string, set: Partial<typeof schema.orders.$inferInsert>) => db.update(schema.orders).set(set).where(eq(schema.orders.number, number));
/** An order awaiting payment, made from a placed one: unpaid, and its boxes no longer counted as sold (as if never paid). */
async function unpay(number: string) {
  const [o] = await db.update(schema.orders).set({ state: "pending_payment", paidAt: null }).where(eq(schema.orders.number, number)).returning({ id: schema.orders.id });
  await db.execute(sql`update drop_boxes d set sold_qty = d.sold_qty - i.qty from order_items i where i.order_id = ${o.id} and i.drop_box_id = d.id`);
}
async function refundsOf(number: string) {
  return db.select({ amount: schema.refunds.amount, reason: schema.refunds.reason, issuedAt: schema.refunds.issuedAt }).from(schema.refunds).innerJoin(schema.orders, eq(schema.orders.id, schema.refunds.orderId)).where(eq(schema.orders.number, number)).orderBy(schema.refunds.createdAt);
}
const cancelEmails = () => mail.sent.filter((e) => e.type === "order_cancelled");

describe.skipIf(!TEST_DATABASE_URL)("cancel and refund", () => {
  let c: string;

  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    mail.reset();
    await clearTestData(db, TABLES);
    await reseed(db);
    [{ id: admin.id }] = await db.insert(schema.customers).values({ email: "owner@test.invalid", name: "Owner", role: "admin" }).returning({ id: schema.customers.id });
    c = await customer("hanako@test.invalid");
  });
  afterAll(async () => {
    await clearTestData(db, TABLES);
    await closeTestDb(pool);
  });

  describe("the shop cancels an order", () => {
    it("while the drop is open: boxes back on sale, the rest refunded as owed, the customer emailed an apology, the timeline signed", async () => {
      await openDrop();
      const number = await order(c);
      expect(await sold("cookie-box")).toBe(15);
      mail.reset();
      expect(await cancelOrderAction(number, { note: "  Customer asked by phone. ", notify: true })).toEqual({ ok: true, refund: 2500, backOnSale: true, emailed: true });
      expect(await sold("cookie-box")).toBe(13);
      expect(await sold("banana-bread")).toBe(7);
      expect(await refundsOf(number)).toEqual([{ amount: 2500, reason: "admin_cancelled", issuedAt: null }]);
      const [m] = cancelEmails();
      expect(m.to).toBe("hanako@test.invalid");
      expect(m.text).toContain("We're sorry: we've had to cancel order");
      expect(m.text).toContain("¥2,500 is being refunded in full");
      expect(m.text).toContain("reply to this email");
      const d = (await orderDetail(number))!;
      expect(d).toMatchObject({ state: "cancelled", canCancel: false, refunded: 2500, refundable: 0 });
      expect(d.timeline.find((e) => e.title === "Cancelled")).toMatchObject({ detail: "By the shop. Customer asked by phone.", by: "Owner" });
      expect(d.timeline.find((e) => e.title === "Refund of ¥2,500 recorded")).toMatchObject({ detail: "Cancelled by the shop. Owed until payments are connected" });
      expect(d.timeline.some((e) => e.title === "Cancellation emailed")).toBe(true);
      expect(await loadOrder(c, number, "en")).toMatchObject({ status: "cancelled", refund: { amount: 2500, issued: false } });
      // Again: nothing more to do, nothing refunded twice.
      expect(await cancelOrderAction(number, { notify: true })).toEqual({ ok: false, error: "This order is already cancelled." });
      expect(await refundsOf(number)).toHaveLength(1);
    });

    it("after the drop has closed (when the customer can't): not back on sale, and no email when told not to", async () => {
      const number = await order(c); // the seeded drop is closed by the clock
      expect(await cancelOrder(c, number)).toEqual({ ok: false, error: "closed" });
      mail.reset();
      expect(await cancelOrderAction(number, { notify: false })).toEqual({ ok: true, refund: 2500, backOnSale: false, emailed: null });
      expect(cancelEmails()).toHaveLength(0);
      expect(await sold("cookie-box")).toBe(13); // no longer sold, so the drop's numbers stay true; it isn't selling
    });

    it("cancels a packed order, and refuses a shipped, an unpaid or a missing one", async () => {
      const packed = await order(c);
      await setOrder(packed, { state: "packed", packedAt: new Date() });
      expect(await cancelOrderAction(packed, { notify: false })).toMatchObject({ ok: true, refund: 2500 });
      const shipped = await order(c);
      await setOrder(shipped, { state: "shipped", shippedAt: new Date() });
      expect(await cancelOrderAction(shipped, { notify: true })).toEqual({ ok: false, error: "It has shipped, so it can't be cancelled. Record a refund instead." });
      const unpaid = await order(c);
      await unpay(unpaid);
      expect(await cancelOrderAction(unpaid, { notify: true })).toEqual({ ok: false, error: "It was never paid, so there's nothing to cancel or refund." });
      expect(await cancelOrderAction("AB-999-999", { notify: true })).toEqual({ ok: false, error: "That order no longer exists." });
      expect(await cancelOrderAction(shipped, { note: "x".repeat(2001) })).toEqual({ ok: false, error: "At most 2,000 characters (this is 2,001)." });
    });
  });

  describe("refunds without cancelling", () => {
    it("refunds part, then the rest on cancelling; never more than was paid, and not twice from a stale page", async () => {
      await openDrop();
      const number = await order(c);
      expect(await refundOrderAction(number, { amount: "¥500", reason: "damage", note: "Lid crushed in the photo." }, 0)).toEqual({ ok: true, amount: 500 });
      expect(await refundOrderAction(number, { amount: "500", reason: "damage" }, 0)).toEqual({ ok: false, error: "Another refund was recorded since this page loaded. Check the timeline, then try again." });
      expect(await refundOrderAction(number, { amount: "2001", reason: "damage" }, 500)).toEqual({ ok: false, errors: { amount: "At most ¥2,000 is left to refund." } });
      expect(await refundOrderAction(number, { amount: "100", reason: "other" }, 500)).toEqual({ ok: false, errors: { note: "Say what it's for. Only the shop sees this." } });
      expect(await refundOrderAction(number, { amount: "100", reason: "damage" }, "500")).toEqual({ ok: false, error: "Reload the page and try again." });
      // The order and its stock are untouched.
      expect(await sold("cookie-box")).toBe(15);
      let d = (await orderDetail(number))!;
      expect(d).toMatchObject({ state: "paid", canCancel: true, refunded: 500, refundable: 2000 });
      expect(d.timeline.find((e) => e.title === "Refund of ¥500 recorded")).toMatchObject({ detail: "Damage. Owed until payments are connected. Lid crushed in the photo.", by: "Owner" });
      expect(d.timeline.filter((e) => e.kind === "step").map((e) => e.title)).toEqual(["Order placed", "Paid"]); // the refund's event isn't a step of its own

      mail.reset();
      expect(await cancelOrderAction(number, { notify: true })).toMatchObject({ ok: true, refund: 2000 });
      expect(cancelEmails()[0].text).toContain("¥2,000 is being refunded to the payment method");
      expect(await refundsOf(number)).toEqual([{ amount: 500, reason: "damage", issuedAt: null }, { amount: 2000, reason: "admin_cancelled", issuedAt: null }]);
      d = (await orderDetail(number))!;
      expect(d).toMatchObject({ refunded: 2500, refundable: 0 });
      expect(await refundOrderAction(number, { amount: "1", reason: "damage" }, 2500)).toEqual({ ok: false, error: "It has been refunded in full already." });
      expect(await loadOrder(c, number, "en")).toMatchObject({ refund: { amount: 2500, issued: false } });
    });

    it("refunds a shipped order in full (non-delivery), which stays shipped", async () => {
      const number = await order(c);
      await setOrder(number, { state: "shipped", shippedAt: new Date() });
      expect(await refundOrderAction(number, { amount: "2,500", reason: "non_delivery" }, 0)).toEqual({ ok: true, amount: 2500 });
      expect(await orderDetail(number)).toMatchObject({ state: "shipped", refundable: 0, canCancel: false });
    });

    it("records one of two refunds sent at once from the same page", async () => {
      const number = await order(c);
      const results = await Promise.all([refundOrderAction(number, { amount: "1500", reason: "damage" }, 0), refundOrderAction(number, { amount: "1500", reason: "damage" }, 0)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await refundsOf(number)).toHaveLength(1);
    });

    it("refuses an unpaid order", async () => {
      const number = await order(c);
      await unpay(number);
      expect(await refundOrderAction(number, { amount: "100", reason: "damage" }, 0)).toEqual({ ok: false, error: "It was never paid, so there's nothing to refund." });
    });
  });

  it("a customer cancelling after a partial refund gets only the rest back", async () => {
    await openDrop();
    const number = await order(c, "ja");
    await refundOrderAction(number, { amount: "500", reason: "damage" }, 0);
    mail.reset();
    expect(await cancelOrder(c, number)).toEqual({ ok: true, refunded: true });
    expect(await refundsOf(number)).toEqual([{ amount: 500, reason: "damage", issuedAt: null }, { amount: 2000, reason: "customer_cancelled", issuedAt: null }]);
    const [m] = cancelEmails();
    expect(m.text).toContain("¥2,000 はお支払い方法へ返金されます");
    expect(m.text).not.toContain("全額");
    expect(m.text).not.toContain("申し訳");
    expect((await orderDetail(number))!.timeline.find((e) => e.title === "Cancelled")).toMatchObject({ detail: "By the customer, from their order page" });
  });

  describe("Cancel drop", () => {
    it("cancels an open drop: every order cancelled and refunded, the drop off the shop, each customer emailed", async () => {
      await openDrop();
      const taro = await customer("taro@test.invalid");
      const a = await order(c);
      const b = await order(taro, "ja");
      const unpaid = await order(taro);
      await unpay(unpaid);
      await refundOrderAction(a, { amount: "500", reason: "damage" }, 0);
      expect(await cancelImpact(DROP)).toEqual({ orders: 3, refund: 2000 + 2500 });
      expect(await cancelDropAction(DROP, 2)).toEqual({ ok: false, error: "The drop has 3 orders to cancel now, not the 2 shown. Check them, then try again." });
      expect((await db.select({ state: schema.drops.state }).from(schema.drops).where(eq(schema.drops.slug, DROP)))[0].state).toBe("open");

      mail.reset();
      expect(await cancelDropAction(DROP, 3)).toEqual({ ok: true, cancelled: 3, refund: 4500, emailed: 3, emailFailed: 0 });
      expect((await db.select({ state: schema.drops.state }).from(schema.drops).where(eq(schema.drops.slug, DROP)))[0].state).toBe("cancelled");
      const states = await db.select({ number: schema.orders.number, state: schema.orders.state }).from(schema.orders);
      expect(states.every((o) => o.state === "cancelled")).toBe(true);
      expect(await refundsOf(b)).toEqual([{ amount: 2500, reason: "drop_cancelled", issuedAt: null }]);
      expect(await refundsOf(unpaid)).toEqual([]);
      expect(await sold("cookie-box")).toBe(13);
      const emails = cancelEmails();
      expect(emails.map((e) => e.to).sort()).toEqual(["hanako@test.invalid", "taro@test.invalid", "taro@test.invalid"]);
      expect(emails.every((e) => e.text.includes("申し訳") || e.text.includes("We're sorry"))).toBe(true);
      expect(emails.find((e) => e.subject.includes(unpaid))!.text).toContain("Nothing was charged.");
      expect((await orderDetail(b))!.timeline.find((e) => e.title === "Cancelled")).toMatchObject({ detail: "The whole drop was cancelled", by: "Owner" });
      expect(await cancelImpact(DROP)).toEqual({ orders: 0, refund: 0 });
      expect(await cancelDropAction(DROP, 0)).toEqual({ ok: false, error: "Cancel drop isn't available: the drop is cancelled." });
    });

    it("cancels a drop with no orders, and says when an email fails", async () => {
      expect(await cancelDrop("drop-04", admin.id, 0, { gapMs: 0 })).toEqual({ ok: true, cancelled: 0, refund: 0, emailed: 0, emailFailed: 0 });
      const number = await order(c);
      mail.failing = "Resend is down";
      expect(await cancelDrop(DROP, admin.id, 1, { gapMs: 0 })).toEqual({ ok: true, cancelled: 1, refund: 2500, emailed: 0, emailFailed: 1 });
      expect((await orderDetail(number))!.timeline.find((e) => e.title === "Cancellation emailed")?.detail).toContain("Failed to hanako@test.invalid: Resend is down");
    });

    it("refuses once baking has started, or when an order has already shipped; and isn't a plain lifecycle action", async () => {
      await order(c);
      await setDrop("baking");
      expect(await cancelDrop(DROP, admin.id, 1, { gapMs: 0 })).toEqual({ ok: false, error: "Cancel drop isn't available: the drop is baking." });
      await setDrop("closed");
      const shipped = await order(c);
      await setOrder(shipped, { state: "shipped", shippedAt: new Date() });
      expect(await cancelDrop(DROP, admin.id, 1, { gapMs: 0 })).toEqual({ ok: false, error: "One of its orders has shipped, so the drop can't be cancelled. Refund orders one by one instead." });
      expect(await transitionDropAction(DROP, "cancel")).toEqual({ ok: false, error: "Cancelling a drop cancels its orders too. Use Cancel drop." });
      expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(eq(schema.orders.state, "cancelled")))[0].n).toBe(0);
    });

    it("racing a checkout that's finishing: the new order is refused or cancelled with the rest, never left paid on a cancelled drop", async () => {
      await openDrop();
      await order(c);
      for (let i = 0; i < 4; i++) {
        const held = await checkout();
        await Promise.all([place(held, c), cancelDrop(DROP, admin.id, 1, { gapMs: 0 })]);
        const live = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.orders)
          .innerJoin(schema.drops, eq(schema.drops.id, schema.orders.dropId))
          .where(and(eq(schema.drops.state, "cancelled"), inArray(schema.orders.state, ["pending_payment", "paid", "packed"])));
        expect(live[0].n).toBe(0);
        // Put things back for the next round: open again, with exactly one live order.
        await clearTestData(db, TABLES);
        await reseed(db);
        [{ id: admin.id }] = await db.insert(schema.customers).values({ email: "owner@test.invalid", name: "Owner", role: "admin" }).returning({ id: schema.customers.id });
        c = await customer("hanako@test.invalid");
        await openDrop();
        await order(c);
      }
    });
  });
});
