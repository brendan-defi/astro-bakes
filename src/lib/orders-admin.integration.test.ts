// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { addOrderNoteAction } from "@/app/admin/(app)/orders/actions";
import { GET as exportCsv } from "@/app/admin/(app)/orders/export/route";
import { placeOrder, startCheckout } from "@/lib/checkout";
import { parseOrderFilters } from "@/lib/order-admin-rules";
import { listOrders, orderDetail } from "@/lib/orders-admin";
import { captureEmail, closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

// The real action and route, with only the admin check and Next's cache stubbed. The admin is a real row, since notes point at it.
const admin = vi.hoisted(() => ({ id: "", email: "owner@test.invalid", name: "Owner" }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => admin }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** The admin's order pages (PRD 4.4) against a real Postgres, with orders placed through the real checkout. */
const { pool, db } = testDb();
captureEmail();
const DROP = "drop-03";

async function customer(email: string, name: string) {
  const [c] = await db.insert(schema.customers).values({ email, name, emailVerifiedAt: new Date() }).returning({ id: schema.customers.id });
  return c.id;
}
async function order(customerId: string, items: Record<string, number>, over: { name?: string; gift?: string | null } = {}) {
  const r = await startCheckout({ dropId: DROP, items, flags: { state: "open" } }, null);
  if (!r.ok || !r.checkoutId) throw new Error("expected holds");
  const p = await placeOrder({ dropId: DROP, checkoutId: r.checkoutId, revision: r.revision!, locale: "ja", delivery: { name: over.name ?? "山田花子", phone: "090-1234-5678", postal: "153-0061", line1: "1-2-3", line2: "" }, gift: over.gift ?? null, paymentMethod: "card", timeSlot: "14_16" }, r.checkoutId, customerId);
  if (!p.ok) throw new Error("expected an order: " + p.error);
  return p.order.number;
}
const f = (sp: Record<string, string> = {}) => parseOrderFilters(sp);

describe.skipIf(!TEST_DATABASE_URL)("admin orders", () => {
  let hanako: string, taro: string;
  let first: string, second: string, third: string;

  beforeAll(async () => {
    await resetDatabase(db);
    [admin.id] = [(await db.insert(schema.customers).values({ email: "owner@test.invalid", name: "Owner", role: "admin" }).returning({ id: schema.customers.id }))[0].id];
    hanako = await customer("hanako@test.invalid", "Hanako Yamada");
    taro = await customer("taro_100%@test.invalid", "Taro");
    first = await order(hanako, { "cookie-box": 2 }, { gift: "Happy birthday!" });
    second = await order(taro, { "banana-bread": 1 }, { name: "=SUM(A1)" });
    third = await order(hanako, { "cookie-box": 1, "banana-bread": 1 });
  });
  beforeEach(() => {});
  afterAll(async () => {
    await closeTestDb(pool);
  });

  it("lists orders newest first with customer, boxes, total and state", async () => {
    const { rows, total } = await listOrders(f());
    expect(total).toBe(3);
    expect(rows.map((r) => r.number)).toEqual([third, second, first]);
    // Placing an order saves the delivery name to the profile (PRD 2.3), so the customer is now 山田花子.
    expect(rows[2]).toMatchObject({ customer: "山田花子", email: "hanako@test.invalid", boxes: "2 × 4 Cookie Box", boxCount: 2, state: "paid", paymentMethod: "card", gift: true, drop: { slug: DROP, number: 3 } });
    expect(rows[0].boxes).toBe("1 × 4 Cookie Box, 1 × Nebula Banana Bread");
  });

  it("filters by drop, state and a search over number, name, email and phone, with LIKE wildcards taken literally", async () => {
    expect((await listOrders(f({ drop: "drop-04" }))).total).toBe(0);
    expect((await listOrders(f({ drop: DROP, state: "paid" }))).total).toBe(3);
    expect((await listOrders(f({ state: "cancelled" }))).total).toBe(0);
    expect((await listOrders(f({ q: "hanako" }))).rows.map((r) => r.number)).toEqual([third, first]);
    expect((await listOrders(f({ q: "山田" }))).rows.map((r) => r.number)).toEqual([third, first]);
    expect((await listOrders(f({ q: second.toLowerCase() }))).rows.map((r) => r.number)).toEqual([second]);
    expect((await listOrders(f({ q: "100%" }))).total).toBe(1);
    expect((await listOrders(f({ q: "%" }))).total).toBe(1); // only Taro's email has a literal %
    expect((await listOrders(f({ q: "090-1234" }))).total).toBe(3);
  });

  it("shows an unpaid order as awaiting payment while its hold lasts, and as expired once it lapses", async () => {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, first));
    await db.update(schema.orders).set({ state: "pending_payment", paidAt: null }).where(eq(schema.orders.id, o.id));
    const [box] = await db.select({ id: schema.dropBoxes.id }).from(schema.dropBoxes).limit(1);
    await db.insert(schema.inventoryHolds).values({ dropBoxId: box.id, orderId: o.id, qty: 1, expiresAt: new Date(Date.now() + 600_000) });
    expect((await listOrders(f({ state: "pending_payment" }))).rows.map((r) => r.number)).toEqual([first]);
    expect((await orderDetail(first))!.state).toBe("pending_payment");
    await db.update(schema.inventoryHolds).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.inventoryHolds.orderId, o.id));
    expect((await listOrders(f({ state: "expired" }))).rows.map((r) => r.number)).toEqual([first]);
    expect((await listOrders(f({ state: "pending_payment" }))).total).toBe(0);
    expect((await orderDetail(first))).toMatchObject({ state: "expired", storedState: "pending_payment" });
    await db.delete(schema.inventoryHolds).where(eq(schema.inventoryHolds.orderId, o.id));
    await db.update(schema.orders).set({ state: "paid", paidAt: o.paidAt }).where(eq(schema.orders.id, o.id));
  });

  it("shows one order in full: lines, totals, delivery, gift card, payment and a timeline with its emails", async () => {
    const d = (await orderDetail(first))!;
    expect(d).toMatchObject({
      number: first, state: "paid", locale: "ja", slot: "14_16", giftMessage: "Happy birthday!", subtotal: 2000, shippingFee: 0, total: 2000, refunded: 0,
      customer: { name: "山田花子", email: "hanako@test.invalid", verified: true },
      shipTo: { name: "山田花子", phone: "090-1234-5678", address: expect.stringContaining("〒153-0061 東京都目黒区") },
      lines: [{ name: "4 Cookie Box", qty: 2, unitPrice: 1000 }],
      payment: { method: "card" },
      drop: { slug: DROP, number: 3 },
    });
    expect(d.drop.arriveAt.getTime() - d.drop.shipAt.getTime()).toBe(86_400_000);
    expect(d.timeline.map((e) => e.title)).toEqual(expect.arrayContaining(["Order placed", "Paid", "Order confirmation emailed", "New-order email to the owner"]));
    expect(d.timeline[0]).toMatchObject({ title: "Order placed", detail: "Mock payment: Stripe not wired yet" });
    expect(await orderDetail("AB-999-999")).toBeNull();
  });

  it("adds a signed internal note through the action, and refuses an empty one", async () => {
    expect(await addOrderNoteAction(second, "  Customer called: leave with the concierge.  ")).toEqual({ ok: true });
    expect(await addOrderNoteAction(second, "  ")).toEqual({ ok: false, error: "Write something first." });
    expect(await addOrderNoteAction("AB-999-999", "Hello")).toEqual({ ok: false, error: "That order no longer exists." });
    const note = (await orderDetail(second))!.timeline.find((e) => e.kind === "note");
    expect(note).toMatchObject({ title: "Note", detail: "Customer called: leave with the concierge.", by: "Owner" });
    const [row] = await db.select().from(schema.orderEvents);
    expect(row).toMatchObject({ kind: "note", actorId: admin.id });
  });

  it("exports the filtered orders as CSV, oldest first, with refunds netted and formula-looking cells defused", async () => {
    const [o] = await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.number, third));
    await db.insert(schema.refunds).values({ orderId: o.id, amount: 500, reason: "damage" });
    const res = await exportCsv(new Request("https://admin.astrobakes.xyz/admin/orders/export?drop=drop-03"));
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="astro-bakes-orders-drop-03-\d{4}-\d{2}-\d{2}\.csv"$/);
    // Response.text() drops a byte-order mark, so look at the bytes.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes).trimEnd().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("Order,Drop,Placed (JST),Paid (JST),Status,Customer,Email,Recipient,Phone,Address,Time slot,Boxes,Box count,Gift message,Subtotal,Shipping,Total,Refunded,Net,Payment,Shipped (JST),Tracking");
    expect(lines[1].startsWith(`${first},Drop 03,`)).toBe(true);
    expect(lines[2]).toContain(",'=SUM(A1),"); // a recipient that looks like a formula
    expect(lines[3]).toMatch(new RegExp(`^${third},.*,1500,0,1500,500,1000,card,,$`));
    const none = await (await exportCsv(new Request("https://admin.astrobakes.xyz/admin/orders/export?state=cancelled"))).text();
    expect(none.trimEnd().split("\r\n")).toHaveLength(1);
  });
});
