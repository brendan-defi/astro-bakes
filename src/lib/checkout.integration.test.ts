// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { availability, heldCheckout, markPaid, placeOrder, startCheckout, type PlaceInput } from "@/lib/checkout";
import { loadDrops } from "@/lib/drops";
import { captureEmail, clearTestData, closeTestDb, resetDatabase, reseed, testDb, TEST_DATABASE_URL } from "@/test/db";

/**
 * The checkout write path against a real Postgres (TEST_DATABASE_URL; see README).
 * Drop 03 in the seed is closed by the clock, so startCheckout gets the demo
 * "open" flag (honoured outside production) and placeOrder is exercised as a
 * checkout finishing after close (PRD 3.8).
 */
const { pool, db } = testDb();
captureEmail(); // placeOrder sends the confirmation; never let a test reach Resend
const DROP = "drop-03";
const OPEN = { state: "open" };

const start = (items: Record<string, number>, cartId: string | null = null, flags: { state?: string; demo?: string } = OPEN) =>
  startCheckout({ dropId: DROP, items, flags }, cartId);
const input = (checkoutId: string, revision: number, over: Partial<PlaceInput> = {}): PlaceInput => ({
  dropId: DROP,
  checkoutId,
  revision,
  locale: "en",
  delivery: { name: "Test Person", phone: "090-0000-0000", postal: "153-0061", line1: "1-2-3", line2: "" },
  gift: null,
  paymentMethod: "card",
  ...over,
});
/** A verified customer to place orders as; placeOrder requires a session's customer (D12). */
async function customer(email: string): Promise<string> {
  const [row] = await db
    .insert(schema.customers)
    .values({ email, emailVerifiedAt: new Date() })
    .onConflictDoUpdate({ target: schema.customers.email, set: { updatedAt: new Date() } })
    .returning({ id: schema.customers.id });
  return row.id;
}
async function held(): Promise<string> {
  const r = await start({ "cookie-box": 2, "banana-bread": 1 });
  if (!r.ok || !r.checkoutId) throw new Error("expected holds");
  return r.checkoutId;
}
async function dropId() {
  return (await db.query.drops.findFirst({ where: eq(schema.drops.slug, DROP) }))!.id;
}
async function sold(slug: string) {
  const [row] = await db
    .select({ sold: schema.dropBoxes.soldQty })
    .from(schema.dropBoxes)
    .innerJoin(schema.boxes, eq(schema.dropBoxes.boxId, schema.boxes.id))
    .innerJoin(schema.drops, eq(schema.dropBoxes.dropId, schema.drops.id))
    .where(and(eq(schema.drops.slug, DROP), eq(schema.boxes.slug, slug)));
  return row.sold;
}
const count = async (table: "orders" | "carts" | "inventory_holds") => Number((await db.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0].n);

describe.skipIf(!TEST_DATABASE_URL)("checkout write path", () => {
  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    await clearTestData(db, ["order_items", "orders", "inventory_holds", "carts"]);
    await reseed(db); // restores sold_qty
  });
  afterAll(async () => {
    await clearTestData(db, ["order_items", "orders", "inventory_holds", "carts"]);
    await closeTestDb(pool);
  });

  it("refuses a drop that isn't open, unless the demo flag says so", async () => {
    expect(await start({ "cookie-box": 1 }, null, {})).toEqual({ ok: false, error: "drop_closed" });
    const r = await start({ "cookie-box": 1 });
    expect(r.ok && r.checkoutId && r.revision === 1 && r.changes.length === 0).toBe(true);
    if (r.ok) expect(r.expiresAt! - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(await count("inventory_holds")).toBe(1);
  });

  it("re-checks against stock and other carts' holds, ignoring the cart's own", async () => {
    const a = await start({ "banana-bread": 3 }); // 10 cap − 7 sold = 3 left
    expect(a.ok && a.checkoutId).toBeTruthy();
    const b = await start({ "banana-bread": 2, "cookie-box": 9 });
    expect(b.ok && b.checkoutId).toBeNull(); // changes → nothing held
    if (b.ok) {
      expect(b.changes).toEqual([
        { kind: "gone", box: "banana-bread", from: 2 },
        { kind: "cut", box: "cookie-box", from: 9, to: 5, left: 7 },
      ]);
      expect(b.left).toMatchObject({ "banana-bread": 0, "cookie-box": 7, "sampler-box": 0 });
    }
    const again = await start({ "banana-bread": 3 }, a.ok ? a.checkoutId : null);
    expect(again.ok && again.revision).toBe(2);
    const avail = await availability(db, await dropId(), null);
    expect(avail.get("banana-bread")!.left).toBe(0);
  });

  it("stores the delivery time slot, treats a missing one as no preference, and rejects an unknown one (D21)", async () => {
    const c = await customer("slot@test.invalid");
    const a = await held();
    const r1 = await placeOrder(input(a, 1, { timeSlot: "14_16" }), a, c);
    expect(r1.ok && r1.order.timeSlot).toBe("14_16");
    const [row1] = await db.select({ slot: schema.orders.deliveryTimeSlot }).from(schema.orders).where(eq(schema.orders.number, "AB-003-001"));
    expect(row1.slot).toBe("14_16");
    const b = await held();
    const r2 = await placeOrder(input(b, 1), b, c); // no timeSlot at all: a tab from before slots existed
    expect(r2.ok && r2.order.timeSlot).toBe("none");
    const d = await held();
    expect(await placeOrder(input(d, 1, { timeSlot: "20_21" as never }), d, c)).toEqual({ ok: false, error: "invalid" });
    expect(await count("orders")).toBe(2);
  });

  it("places an order, sells the stock, releases the holds and numbers in sequence", async () => {
    const id = await held();
    const r = await placeOrder(input(id, 1, { gift: "Happy birthday!" }), id, await customer("one@test.invalid"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order).toMatchObject({ number: "AB-003-001", subtotal: 2500, shippingFee: 0, total: 2500, email: "one@test.invalid" });
    expect(r.order.lines).toEqual([
      { name: "4 Cookie Box", qty: 2, lineTotal: 2000 },
      { name: "Nebula Banana Bread", qty: 1, lineTotal: 500 },
    ]);
    expect(await sold("cookie-box")).toBe(15);
    expect(await sold("banana-bread")).toBe(8);
    expect(await count("inventory_holds")).toBe(0);
    expect(await count("carts")).toBe(0);
    const [order] = await db.select().from(schema.orders);
    expect(order).toMatchObject({ state: "paid", checkoutId: id, dropSequence: 1, shipToName: "Test Person", city: "目黒区", wardCode: "13110", giftMessage: "Happy birthday!" });
    expect(order.notes).toMatch(/mock payment/i);
    const id2 = await held();
    const r2 = await placeOrder(input(id2, 1), id2, await customer("two@test.invalid"));
    expect(r2.ok && r2.order.number).toBe("AB-003-002");
  });

  it("turns concurrent submissions of one held cart into exactly one order", async () => {
    const id = await held();
    const results = await Promise.all([placeOrder(input(id, 1), id, await customer("race@test.invalid")), placeOrder(input(id, 1), id, await customer("race@test.invalid"))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.error)).toEqual(["hold_expired"]);
    expect(await count("orders")).toBe(1);
    expect(await sold("cookie-box")).toBe(15);
  });

  it("rejects a submission whose reservation changed in another tab", async () => {
    const id = await held(); // revision 1: 2 cookies + 1 loaf
    const other = await start({ "cookie-box": 1 }, id); // the same cart, replaced from another tab
    expect(other.ok && other.revision).toBe(2);
    expect(await placeOrder(input(id, 1), id, await customer("tabs@test.invalid"))).toEqual({ ok: false, error: "changed" });
    const r = await placeOrder(input(id, 2), id, await customer("tabs@test.invalid"));
    expect(r.ok && r.order.lines).toEqual([{ name: "4 Cookie Box", qty: 1, lineTotal: 1000 }]);
  });

  it("enforces the per-customer limit across the customer's orders in the drop (D7)", async () => {
    const first = await start({ "cookie-box": 3 });
    expect((await placeOrder(input(first.ok ? first.checkoutId! : "", 1), first.ok ? first.checkoutId : null, await customer("greedy@test.invalid"))).ok).toBe(true);
    const second = await start({ "cookie-box": 3 });
    const id2 = second.ok ? second.checkoutId! : "";
    expect(await placeOrder(input(id2, 1), id2, await customer("greedy@test.invalid"))).toEqual({ ok: false, error: "limit", box: "cookie-box", name: "4 Cookie Box", max: 5, already: 3 });
    expect(await count("orders")).toBe(1);
    const third = await start({ "cookie-box": 2 }, id2);
    expect((await placeOrder(input(id2, third.ok ? third.revision! : 0), id2, await customer("greedy@test.invalid"))).ok).toBe(true);
    expect((await placeOrder(input(id2, 1), id2, await customer("other@test.invalid"))).ok).toBe(false); // cart consumed
  });

  it("saves the confirmed delivery details onto the signed-in customer (PRD 2.3)", async () => {
    const [c] = await db
      .insert(schema.customers)
      .values({ email: "existing@test.invalid", name: "Old Name", phone: "080-1111-1111", emailVerifiedAt: new Date() })
      .returning({ id: schema.customers.id });
    await db.insert(schema.addresses).values({ customerId: c.id, postalCode: "1500001", prefecture: "東京都", city: "渋谷区", town: "神宮前", line1: "9-9-9", wardCode: "13113" });
    const id = await held();
    // +81 and full-width: both the profile and the order keep the normalised domestic number.
    const r = await placeOrder(input(id, 1, { delivery: { name: "New Name", phone: "+81 ９０ー９９９９ー９９９９", postal: "153-0061", line1: "1-2-3", line2: "Room 4" } }), id, c.id);
    expect(r.ok && r.order.email).toBe("existing@test.invalid");
    const me = await db.query.customers.findFirst({ where: eq(schema.customers.id, c.id), with: { address: true } });
    expect(me).toMatchObject({ name: "New Name", phone: "090-9999-9999", address: { postalCode: "1530061", city: "目黒区", line1: "1-2-3", line2: "Room 4", wardCode: "13110" } });
    const [order] = await db.select().from(schema.orders);
    expect(order).toMatchObject({ customerId: c.id, shipToName: "New Name", phone: "090-9999-9999", city: "目黒区" });
  });

  it("refuses to place an order without a signed-in customer (D12)", async () => {
    const id = await held();
    expect(await placeOrder(input(id, 1), id, null)).toEqual({ ok: false, error: "signed_out" });
    expect(await placeOrder(input(id, 1), id, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "signed_out" });
    expect(await count("orders")).toBe(0);
    expect(await heldCheckout(id)).not.toBeNull(); // the reservation survives for after sign-in
  });

  it("lets a held checkout finish after the drop closed, while new checkouts are refused", async () => {
    const id = await held();
    expect(await heldCheckout(id)).toMatchObject({ checkoutId: id, dropSlug: DROP, revision: 1, items: { "cookie-box": 2, "banana-bread": 1 } });
    expect(await start({ "cookie-box": 1 }, id, {})).toEqual({ ok: false, error: "drop_closed" });
    expect((await placeOrder(input(id, 1), id, await customer("late@test.invalid"))).ok).toBe(true);
    expect(await heldCheckout(id)).toBeNull();
  });

  it("treats expired holds as gone everywhere", async () => {
    const id = await held();
    await db.update(schema.inventoryHolds).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(schema.inventoryHolds.cartId, id));
    expect(await heldCheckout(id)).toBeNull();
    expect((await availability(db, await dropId(), null)).get("cookie-box")!.left).toBe(7);
    expect(await placeOrder(input(id, 1), id, await customer("slow@test.invalid"))).toEqual({ ok: false, error: "hold_expired" });
  });

  it("rejects a missing or mismatched cookie and invalid details", async () => {
    const id = await held();
    expect(await placeOrder(input(id, 1), null, await customer("x@test.invalid"))).toEqual({ ok: false, error: "hold_expired" });
    expect(await placeOrder(input(id, 1), "00000000-0000-4000-8000-000000000000", await customer("x@test.invalid"))).toEqual({ ok: false, error: "changed" });
    expect(await placeOrder(input(id, 1, { delivery: { name: "A", phone: "1", postal: "180-0004", line1: "1", line2: "" } }), id, await customer("x@test.invalid"))).toEqual({ ok: false, error: "invalid" });
    // A bad phone number alone is enough, with everything else valid.
    for (const phone of ["dsfasd", "090-1234-567"]) {
      expect(await placeOrder(input(id, 1, { delivery: { name: "A", phone, postal: "153-0061", line1: "1", line2: "" } }), id, await customer("x@test.invalid"))).toEqual({ ok: false, error: "invalid" });
    }
    expect(await count("orders")).toBe(0);
    expect(await heldCheckout(id)).not.toBeNull();
  });

  it("never deadlocks startCheckout against placeOrder", async () => {
    // Each round: one browser submits its held cart while several others start checkouts. Postgres would
    // raise 40P01 on a lock-order cycle, which surfaces here as a rejected promise.
    for (let round = 0; round < 6; round++) {
      const id = await held();
      const results = await Promise.all([
        placeOrder(input(id, 1), id, await customer(`dl${round}@test.invalid`)),
        start({ "cookie-box": 1 }),
        start({ "banana-bread": 1 }),
        start({ "cookie-box": 2, "banana-bread": 1 }),
      ]);
      expect(results[0].ok).toBe(true);
      for (const r of results.slice(1)) expect(r.ok).toBe(true);
      await db.execute(sql`truncate order_items, orders, inventory_holds, carts cascade`);
      await reseed(db);
    }
  });

  it("storefront availability subtracts other carts' active holds but not the viewer's own (D6, D8)", async () => {
    const id = await held(); // 2 cookies + 1 loaf
    const left = async (exclude: string | null) => Object.fromEntries((await loadDrops("en", exclude)).find((d) => d.id === DROP)!.boxes.map((b) => [b.id, b.left]));
    expect(await left(null)).toMatchObject({ "cookie-box": 5, "banana-bread": 2, "sampler-box": 0 });
    expect(await left(id)).toMatchObject({ "cookie-box": 7, "banana-bread": 3 });
    await db.update(schema.inventoryHolds).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.inventoryHolds.cartId, id));
    expect(await left(null)).toMatchObject({ "cookie-box": 7, "banana-bread": 3 });
  });

  it("refuses to complete a reservation once the drop is cancelled, and stops offering it", async () => {
    const id = await held();
    await db.update(schema.drops).set({ state: "cancelled" }).where(eq(schema.drops.slug, DROP));
    expect(await heldCheckout(id)).toBeNull();
    expect(await placeOrder(input(id, 1), id, await customer("cancelled@test.invalid"))).toEqual({ ok: false, error: "drop_closed" });
    expect(await count("orders")).toBe(0);
    expect(await sold("cookie-box")).toBe(13);
    // A merely closed drop still lets the hold finish (PRD 3.8).
    await db.update(schema.drops).set({ state: "closed" }).where(eq(schema.drops.slug, DROP));
    expect(await heldCheckout(id)).not.toBeNull();
    expect((await placeOrder(input(id, 1), id, await customer("cancelled@test.invalid"))).ok).toBe(true);
  });

  it("treats a malformed cart id as no cart instead of failing the query", async () => {
    const junk = "------------------------------------";
    await expect(loadDrops("en", junk)).resolves.toBeTruthy();
    expect(await heldCheckout(junk)).toBeNull();
    expect(await placeOrder(input(junk, 1), junk, await customer("junk@test.invalid"))).toEqual({ ok: false, error: "hold_expired" });
    const r = await start({ "cookie-box": 1 }, junk);
    expect(r.ok && r.checkoutId).toBeTruthy();
  });

  it("markPaid is idempotent", async () => {
    const id = await held();
    const r = await placeOrder(input(id, 1), id, await customer("idem@test.invalid"));
    expect(r.ok).toBe(true);
    const [order] = await db.select({ id: schema.orders.id }).from(schema.orders);
    await db.transaction((tx) => markPaid(tx, order.id));
    expect(await sold("cookie-box")).toBe(15);
  });
});
