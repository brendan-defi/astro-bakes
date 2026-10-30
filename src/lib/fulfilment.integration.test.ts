// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { setPackedAction } from "@/app/admin/(app)/drops/[slug]/packing/actions";
import { transitionDropAction } from "@/app/admin/(app)/drops/actions";
import { cancelOrder } from "@/lib/account";
import { placeOrder, startCheckout } from "@/lib/checkout";
import { toJstLocal } from "@/lib/drop-rules";
import { transitionDrop } from "@/lib/drops-admin";
import { packList, productionSheet, setPacked } from "@/lib/fulfilment";
import { orderDetail } from "@/lib/orders-admin";
import { captureEmail, clearTestData, closeTestDb, resetDatabase, reseed, testDb, TEST_DATABASE_URL } from "@/test/db";

// The real actions, with only the admin check and Next's cache stubbed.
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ id: "", email: "owner@test.invalid", name: "Owner" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** The production sheet, the pack list and packing (PRD 4.5, 4.6) against a real Postgres, orders through the real checkout. */
const { pool, db } = testDb(4);
captureEmail();
const DROP = "drop-03";
const TABLES = ["order_events", "refunds", "order_items", "orders", "inventory_holds", "carts", "notification_log"];

async function customer(email: string) {
  const [c] = await db.insert(schema.customers).values({ email, name: "Test Person", emailVerifiedAt: new Date() }).returning({ id: schema.customers.id });
  return c.id;
}
async function order(customerId: string, items: Record<string, number>, over: { gift?: string; name?: string; slot?: "none" | "18_20" } = {}) {
  const r = await startCheckout({ dropId: DROP, items, flags: { state: "open" } }, null);
  if (!r.ok || !r.checkoutId) throw new Error("expected holds");
  const p = await placeOrder({ dropId: DROP, checkoutId: r.checkoutId, revision: r.revision!, locale: "en", delivery: { name: over.name ?? "Test Person", phone: "090-0000-0000", postal: "153-0061", line1: "1-2-3", line2: "" }, gift: over.gift ?? null, paymentMethod: "card", timeSlot: over.slot ?? "none" }, r.checkoutId, customerId);
  if (!p.ok) throw new Error("expected an order: " + p.error);
  return p.order.number;
}
const stateOf = async (number: string) => (await db.select({ state: schema.orders.state, packedAt: schema.orders.packedAt }).from(schema.orders).where(eq(schema.orders.number, number)))[0];
const dropState = async () => (await db.select({ state: schema.drops.state }).from(schema.drops).where(eq(schema.drops.slug, DROP)))[0].state;
const buffer = (slug: string, n: number) => db.update(schema.items).set({ bakeBuffer: n }).where(eq(schema.items.slug, slug));
/** Close the drop as the owner would (Close now), so its orders can be packed. */
const closeDrop = async () => expect(await transitionDrop(DROP, "close")).toMatchObject({ ok: true, state: "closed" });
/** Wait until this many sessions are blocked on a lock (a row lock someone else holds). */
async function waitingOnLocks(n: number) {
  for (let i = 0; i < 200; i++) {
    const [{ waiting }] = (await db.execute(sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`)).rows as { waiting: number }[];
    if (waiting >= n) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`expected ${n} sessions waiting on a lock`);
}

// Each test places orders through the real checkout, a few seconds apiece when the whole suite is running.
describe.skipIf(!TEST_DATABASE_URL)("fulfilment", { timeout: 60_000 }, () => {
  let buyer: string;

  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    await clearTestData(db, TABLES);
    await reseed(db);
    // Open for another hour (reseed leaves drop-03 closed by the clock), and the seed's sold counts stand for orders
    // that don't exist, so every box starts with stock to sell.
    await db.update(schema.drops).set({ state: "open", closeAt: new Date(Date.now() + 3_600_000) }).where(eq(schema.drops.slug, DROP));
    await db.execute(sql`update drop_boxes set sold_qty = 0`);
    await db.update(schema.items).set({ bakeBuffer: 0 });
    buyer = await customer("buyer@test.invalid");
  });
  afterAll(async () => {
    await closeTestDb(pool);
  });

  it("counts what to bake from paid orders only, through each box's recipe, with each item's buffer", async () => {
    await buffer("banana-bread-slice", 1);
    await buffer("midnight-choc-cake-slice", 1);
    await buffer("banana-bread-mini-loaf", 1);
    await order(buyer, { "cookie-box": 2, "sampler-box": 1 }, { gift: "Happy birthday!" });
    await order(buyer, { "sampler-box": 2, "banana-bread": 1 });
    // Neither of these is baked for: one is cancelled, one never paid.
    const cancelled = await order(buyer, { "cookie-box": 3 });
    expect(await cancelOrder(buyer, cancelled)).toMatchObject({ ok: true });
    const unpaid = await order(buyer, { "banana-bread": 2 }, { gift: "Not counted" });
    await db.update(schema.orders).set({ state: "pending_payment", paidAt: null }).where(eq(schema.orders.number, unpaid));

    const sheet = (await productionSheet(DROP))!;
    expect(sheet.drop).toMatchObject({ slug: DROP, state: "open" });
    expect(sheet).toMatchObject({ orders: 2, giftCards: 1 });
    expect(sheet.plan.boxes).toEqual([{ nameEn: "4 Cookie Box", count: 2 }, { nameEn: "Nebula Banana Bread", count: 1 }, { nameEn: "Sampler Box", count: 3 }]);
    expect(sheet.plan.totalBoxes).toBe(6);
    expect(sheet.plan.unplanned).toEqual([]);
    const rows = Object.fromEntries(sheet.plan.items.map((r) => [r.item.slug, [r.needed, r.base, r.buffer, r.toBake, r.spare]]));
    expect(rows).toEqual({
      // 2 cookie boxes × 1, plus 3 samplers × 2.
      "cookie-american-choc-chip": [8, 8, 0, 8, 0],
      "cookie-matcha-white-choc": [2, 2, 0, 2, 0],
      "cookie-double-choc-walnut": [2, 2, 0, 2, 0],
      "cookie-cookies-and-cream": [2, 2, 0, 2, 0],
      "banana-bread-mini-loaf": [1, 1, 1, 2, 1],
      // 3 slices of a 6-slice loaf, and of a 12-slice cake: one each, plus the spare.
      "banana-bread-slice": [3, 1, 1, 2, 9],
      "midnight-choc-cake-slice": [3, 1, 1, 2, 21],
    });
    // Grouped by what the kitchen counts in.
    expect(sheet.plan.items.map((r) => r.item.productionUnit)).toEqual(["cake", "cookie", "cookie", "cookie", "cookie", "mini loaf", "mini loaf"]);
  });

  it("uses the box's recipe as it is now, and names a sold box that has none", async () => {
    await order(buyer, { "banana-bread": 2 });
    const [box] = await db.select({ id: schema.boxes.id }).from(schema.boxes).where(eq(schema.boxes.slug, "banana-bread"));
    await db.delete(schema.boxItems).where(eq(schema.boxItems.boxId, box.id));
    const sheet = (await productionSheet(DROP))!;
    expect(sheet.plan).toMatchObject({ items: [], totalBoxes: 2, unplanned: ["Nebula Banana Bread"] });
    expect(await productionSheet("no-such-drop")).toBeNull();
  });

  it("lists every paid order by number, with its boxes, card, ward and slot", async () => {
    const a = await order(buyer, { "cookie-box": 1, "banana-bread": 2 }, { gift: "  For Mum  ", slot: "18_20", name: "山田花子" });
    const b = await order(buyer, { "sampler-box": 1 });
    const gone = await order(buyer, { "cookie-box": 1 });
    expect(await cancelOrder(buyer, gone)).toMatchObject({ ok: true });
    const list = (await packList(DROP))!;
    expect(list.rows.map((r) => r.number)).toEqual([a, b]);
    expect(list.rows[0]).toMatchObject({ state: "paid", packedAt: null, shipToName: "山田花子", ward: "目黒区", slot: "18_20", giftMessage: "For Mum", lines: [{ name: "4 Cookie Box", qty: 1 }, { name: "Nebula Banana Bread", qty: 2 }] });
    expect(list.rows[1].giftMessage).toBeNull();
    // Still open: nothing can be packed yet, and the page says why.
    expect(list).toMatchObject({ packable: false, refusal: expect.stringMatching(/still open/) });
    await closeDrop();
    expect(await packList(DROP)).toMatchObject({ packable: true, refusal: null });
  });

  it("packs only once the drop has closed, and unpacks; asking twice changes nothing", async () => {
    const n = await order(buyer, { "cookie-box": 1 });
    expect(await setPackedAction(n, true)).toEqual({ ok: false, error: expect.stringMatching(/still open/) });
    expect(await stateOf(n)).toEqual({ state: "paid", packedAt: null });

    await closeDrop();
    const packed = await setPackedAction(n, true);
    expect(packed).toMatchObject({ ok: true, packedAt: expect.any(Date) });
    const first = await stateOf(n);
    expect(first.state).toBe("packed");
    // A second tab ticking it again keeps the first time.
    expect(await setPackedAction(n, true)).toEqual({ ok: true, packedAt: first.packedAt });
    expect((await orderDetail(n))!.timeline.map((e) => e.title)).toContain("Packed");

    expect(await setPackedAction(n, false)).toEqual({ ok: true, packedAt: null });
    expect(await stateOf(n)).toEqual({ state: "paid", packedAt: null });
    expect(await setPackedAction(n, false)).toEqual({ ok: true, packedAt: null });
    expect((await orderDetail(n))!.timeline.map((e) => e.title)).not.toContain("Packed");

    expect(await setPackedAction(n, "yes")).toEqual({ ok: false, error: "Reload the page and try again." });
    expect(await setPackedAction("AB-999-999", true)).toEqual({ ok: false, error: "That order no longer exists." });
  });

  it("refuses to pack an order that's cancelled, unpaid or shipped", async () => {
    const gone = await order(buyer, { "cookie-box": 1 });
    expect(await cancelOrder(buyer, gone)).toMatchObject({ ok: true });
    const unpaid = await order(buyer, { "cookie-box": 1 });
    await db.update(schema.orders).set({ state: "pending_payment", paidAt: null }).where(eq(schema.orders.number, unpaid));
    const sent = await order(buyer, { "cookie-box": 1 });
    await db.update(schema.orders).set({ state: "shipped", shippedAt: new Date() }).where(eq(schema.orders.number, sent));
    await closeDrop();
    expect(await setPacked(gone, true)).toEqual({ ok: false, error: "It was cancelled." });
    expect(await setPacked(unpaid, true)).toEqual({ ok: false, error: "It hasn't been paid." });
    expect(await setPacked(sent, true)).toEqual({ ok: false, error: "It has shipped already." });
    expect(await setPacked(sent, false)).toEqual({ ok: false, error: "It has shipped already." });
  });

  it("won't reopen a drop while any of its orders is packed, since its customers could no longer cancel", async () => {
    const n = await order(buyer, { "cookie-box": 1 });
    await closeDrop();
    expect(await setPacked(n, true)).toMatchObject({ ok: true });
    // The form's datetime-local value, in Japan time.
    const closeAt = toJstLocal(new Date(Date.now() + 3_600_000));
    expect(await transitionDropAction(DROP, "reopen", { closeAt })).toEqual({ ok: false, error: "One of its orders is already packed or shipped, so it can't reopen. A packed order can be unticked on the pack list." });
    expect(await dropState()).toBe("closed");
    expect(await setPacked(n, false)).toMatchObject({ ok: true });
    expect(await transitionDropAction(DROP, "reopen", { closeAt })).toMatchObject({ ok: true, state: "open" });
  });

  it("packing waits for a Reopen in progress, then sees the drop open and refuses", async () => {
    const n = await order(buyer, { "cookie-box": 1 });
    await closeDrop();
    // A Reopen half done: it holds the drop's row lock and has reopened the drop, not yet committed.
    const client = await pool!.connect();
    try {
      await client.query("begin");
      await client.query("select id from drops where slug = $1 for update", [DROP]);
      await client.query("update drops set state = 'open', close_at = now() + interval '1 hour' where slug = $1", [DROP]);
      const packing = setPacked(n, true);
      await waitingOnLocks(1);
      await client.query("commit");
      expect(await packing).toEqual({ ok: false, error: expect.stringMatching(/still open/) });
    } finally {
      // Ends the transaction if the test failed before its commit, so its locks can't hold up the next test.
      await client.query("rollback").catch(() => {});
      client.release();
    }
    expect((await stateOf(n)).state).toBe("paid");
  });

  it("a Reopen waits for packing in progress, then sees the packed order and refuses", async () => {
    const n = await order(buyer, { "cookie-box": 1 });
    await closeDrop();
    // Packing half done, taking the locks setPacked takes: the order, then a share of the drop.
    const client = await pool!.connect();
    try {
      await client.query("begin");
      await client.query("select id from orders where number = $1 for update", [n]);
      await client.query("select id from drops where slug = $1 for share", [DROP]);
      await client.query("update orders set state = 'packed', packed_at = now() where number = $1", [n]);
      const reopening = transitionDrop(DROP, "reopen", { closeAt: new Date(Date.now() + 3_600_000) });
      await waitingOnLocks(1);
      await client.query("commit");
      expect(await reopening).toMatchObject({ ok: false, error: expect.stringMatching(/already packed/) });
    } finally {
      // Ends the transaction if the test failed before its commit, so its locks can't hold up the next test.
      await client.query("rollback").catch(() => {});
      client.release();
    }
    expect(await dropState()).toBe("closed");
  });
});
