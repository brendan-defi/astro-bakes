// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { transitionDropAction } from "@/app/admin/(app)/drops/actions";
import { resendOrderEmailAction, shipOrderAction, updateDeliveryAction } from "@/app/admin/(app)/orders/actions";
import { cancelOrder, changeTimeSlot, loadOrder } from "@/lib/account";
import { placeOrder, startCheckout } from "@/lib/checkout";
import { transitionDrop, undeliveredCount } from "@/lib/drops-admin";
import { setPacked } from "@/lib/fulfilment";
import { fmtDate } from "@/lib/format";
import { orderDetail } from "@/lib/orders-admin";
import { captureEmail, clearTestData, closeTestDb, resetDatabase, reseed, testDb, TEST_DATABASE_URL } from "@/test/db";

// The real actions, with only the admin check and Next's cache stubbed. The admin is a real row, since events point at it.
const admin = vi.hoisted(() => ({ id: "", email: "owner@shop.invalid", name: "Owner" }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => admin }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Shipping, delivery edits and resending emails (PRD 3.7, 4.4, 4.6) against a real Postgres, orders through the real checkout. */
const { pool, db } = testDb(4);
const mail = captureEmail();
const DROP = "drop-03";
const TABLES = ["order_events", "refunds", "order_items", "orders", "inventory_holds", "carts", "notification_log"];
const DAY = 86_400_000;

async function customer(email: string) {
  const [c] = await db.insert(schema.customers).values({ email, name: "Test Person", emailVerifiedAt: new Date() }).returning({ id: schema.customers.id });
  return c.id;
}
async function order(customerId: string, locale: "en" | "ja" = "en", slot: "none" | "14_16" = "14_16") {
  const r = await startCheckout({ dropId: DROP, items: { "cookie-box": 1 }, flags: { state: "open" } }, null);
  if (!r.ok || !r.checkoutId) throw new Error("expected holds");
  const p = await placeOrder({ dropId: DROP, checkoutId: r.checkoutId, revision: r.revision!, locale, delivery: { name: "Test Person", phone: "090-0000-0000", postal: "153-0061", line1: "1-2-3", line2: "" }, gift: null, paymentMethod: "card", timeSlot: slot }, r.checkoutId, customerId);
  if (!p.ok) throw new Error("expected an order: " + p.error);
  return p.order.number;
}
const row = async (number: string) => (await db.select().from(schema.orders).where(eq(schema.orders.number, number)))[0];
const closeDrop = async () => expect(await transitionDrop(DROP, "close")).toMatchObject({ ok: true });
const shipped = () => mail.sent.filter((e) => e.type === "shipped");
const ship = (number: string, tracking: string, notify = true) => shipOrderAction(number, { tracking, notify });
const correct = (number: string, tracking: string, notify = true) => shipOrderAction(number, { tracking, notify, correct: true });
const titles = async (number: string) => (await orderDetail(number))!.timeline.map((e) => e.title);

// Each test places orders through the real checkout, a few seconds apiece when the whole suite is running.
describe.skipIf(!TEST_DATABASE_URL)("shipping, delivery edits and resends", { timeout: 60_000 }, () => {
  let buyer: string;

  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    await clearTestData(db, TABLES);
    await reseed(db);
    await db.update(schema.drops).set({ state: "open", closeAt: new Date(Date.now() + 3_600_000) }).where(eq(schema.drops.slug, DROP));
    await db.execute(sql`update drop_boxes set sold_qty = 0`);
    await db.delete(schema.customers).where(eq(schema.customers.email, admin.email));
    admin.id = (await db.insert(schema.customers).values({ email: admin.email, name: "Owner", role: "admin" }).returning({ id: schema.customers.id }))[0].id;
    buyer = await customer("buyer@test.invalid");
    mail.reset();
  });
  afterAll(async () => {
    await closeTestDb(pool);
  });

  it("ships an order once its drop has closed: tracking stored, the customer emailed the number and Japan Post's link", async () => {
    const n = await order(buyer, "ja");
    expect(await ship(n, "1234-5678-9012")).toEqual({ ok: false, error: expect.stringMatching(/still open.*ship once it has closed/) });
    await closeDrop();
    expect(await ship(n, "1234-5678")).toEqual({ ok: false, field: "tracking", error: "Enter the tracking number: the 12-digit number on the Japan Post label, like 1234-5678-9012." });
    mail.reset();
    expect(await ship(n, "１２３４－５６７８－９０１２")).toEqual({ ok: true, emailed: true });
    expect(await row(n)).toMatchObject({ state: "shipped", trackingNumber: "123456789012", shippedAt: expect.any(Date) });
    expect(shipped()).toHaveLength(1);
    const [e] = shipped();
    const arrive = fmtDate(new Date((await db.select({ shipAt: schema.drops.shipAt }).from(schema.drops).where(eq(schema.drops.slug, DROP)))[0].shipAt.getTime() + DAY), "ja");
    expect(e).toMatchObject({ to: "buyer@test.invalid", subject: `ご注文の品を発送しました（${n}）`, idempotencyKey: `order-shipped/${(await row(n)).id}` });
    expect(e.text).toContain("お問い合わせ番号: 1234-5678-9012");
    expect(e.text).toContain("reqCodeNo1=123456789012&searchKind=S002&locale=ja");
    expect(e.text).toContain(`お届け予定: ${arrive}（14時〜16時）`);
    // The timeline signs the step; the customer's page shows the number.
    expect((await orderDetail(n))!.timeline.find((x) => x.title === "Shipped")).toMatchObject({ detail: "Tracking 1234-5678-9012", by: "Owner" });
    expect(await loadOrder(buyer, n, "ja")).toMatchObject({ status: "shipped", trackingNumber: "123456789012" });
    // Only once; and the drop can't reopen now.
    expect(await ship(n, "1234-5678-9013")).toEqual({ ok: false, error: "It has shipped already. Correct the tracking number instead." });
    expect(await transitionDrop(DROP, "reopen", { closeAt: new Date(Date.now() + 3_600_000) })).toMatchObject({ ok: false, error: expect.stringMatching(/already packed or shipped/) });
  });

  it("ships a packed order, quietly when asked, and refuses cancelled or unpaid ones", async () => {
    const packed = await order(buyer);
    const quiet = await order(buyer);
    const gone = await order(buyer);
    expect(await cancelOrder(buyer, gone)).toMatchObject({ ok: true });
    const unpaid = await order(buyer);
    await db.update(schema.orders).set({ state: "pending_payment", paidAt: null }).where(eq(schema.orders.number, unpaid));
    await closeDrop();
    expect(await setPacked(packed, true)).toMatchObject({ ok: true });
    mail.reset();
    expect(await ship(packed, "111122223333")).toEqual({ ok: true, emailed: true });
    expect(await ship(quiet, "111122224444", false)).toEqual({ ok: true, emailed: null });
    expect(shipped().map((e) => e.text.includes("1111-2222-3333"))).toEqual([true]);
    expect(await ship(gone, "111122225555")).toEqual({ ok: false, error: "It was cancelled." });
    expect(await ship(unpaid, "111122225555")).toEqual({ ok: false, error: "It hasn't been paid." });
    expect(await ship("AB-999-999", "111122225555")).toEqual({ ok: false, error: "That order no longer exists." });
  });

  it("dates a late shipment from when it actually went, the same in the email and on both order pages", async () => {
    const n = await order(buyer, "ja", "none");
    const onTime = await order(buyer, "en", "none");
    // The ship date was three days ago; they go out now.
    const plannedShip = new Date(Date.now() - 3 * DAY);
    await db.update(schema.drops).set({ state: "baking", closeAt: new Date(Date.now() - 5 * DAY), shipAt: plannedShip }).where(eq(schema.drops.slug, DROP));
    expect(await ship(n, "123456789012")).toMatchObject({ ok: true, emailed: true });
    const tomorrow = new Date(Date.now() + DAY);
    expect(shipped()[0].text).toContain(`お届け予定: ${fmtDate(tomorrow, "ja")}\n`);
    const customer = (await loadOrder(buyer, n, "ja"))!;
    expect(fmtDate(customer.shipAt, "ja")).toBe(fmtDate(new Date(), "ja"));
    expect(fmtDate(customer.arriveAt, "ja")).toBe(fmtDate(tomorrow, "ja"));
    const adminView = (await orderDetail(n))!;
    expect(adminView.dates).toMatchObject({ late: true });
    expect(fmtDate(adminView.dates.arriveAt)).toBe(fmtDate(tomorrow));
    expect(adminView.drop.shipAt).toEqual(plannedShip); // the plan stays for the admin, beside it
    // Not shipped yet: both still show the drop's plan.
    expect((await orderDetail(onTime))!.dates).toEqual({ shipAt: plannedShip, arriveAt: new Date(plannedShip.getTime() + DAY), late: false });
    expect((await loadOrder(buyer, onTime, "en"))!.arriveAt).toEqual(new Date(plannedShip.getTime() + DAY));
  });

  it("ships an order after its drop was marked complete, and Mark complete runs again to deliver it", async () => {
    const a = await order(buyer);
    const b = await order(buyer);
    await closeDrop();
    await ship(a, "111122223333");
    expect(await transitionDrop(DROP, "baking")).toMatchObject({ ok: true });
    expect(await transitionDrop(DROP, "shipped")).toMatchObject({ ok: true });
    expect(await transitionDrop(DROP, "complete")).toMatchObject({ ok: true, state: "complete" });
    expect([(await row(a)).state, (await row(b)).state]).toEqual(["complete", "paid"]);
    expect(await undeliveredCount(DROP)).toBe(0);
    expect(await transitionDrop(DROP, "complete")).toMatchObject({ ok: false, error: expect.stringMatching(/isn't available/) });
    // B was late: it ships after the drop was completed, and isn't delivered by shipping.
    expect(await ship(b, "111122224444")).toMatchObject({ ok: true });
    expect((await row(b)).state).toBe("shipped");
    expect(await undeliveredCount(DROP)).toBe(1);
    expect(await transitionDropAction(DROP, "complete")).toEqual({ ok: true, state: "complete" });
    expect((await row(b)).state).toBe("complete");
    expect(await undeliveredCount(DROP)).toBe(0);
    expect(await transitionDrop(DROP, "complete")).toMatchObject({ ok: false });
  });

  it("corrects a shipped order's tracking number and emails the right one under a key of its own", async () => {
    const n = await order(buyer);
    await closeDrop();
    expect(await correct(n, "123456789012")).toEqual({ ok: false, error: "It hasn't shipped yet, so there's no tracking number to correct." });
    await ship(n, "123456789012");
    expect(await correct(n, "1234 5678 9012")).toEqual({ ok: false, field: "tracking", error: "That's the tracking number it has already." });
    mail.reset();
    expect(await correct(n, "123456789099")).toEqual({ ok: true, emailed: true });
    expect((await row(n)).trackingNumber).toBe("123456789099");
    const [e] = shipped();
    expect(e.subject).toBe(`Corrected tracking number for order ${n}`);
    expect(e.idempotencyKey).toMatch(new RegExp(`^order-shipped/${(await row(n)).id}/123456789099/corrected-\\d+$`));
    expect((await orderDetail(n))!.timeline.find((x) => x.title === "Tracking number corrected")).toMatchObject({ detail: "1234-5678-9012 → 1234-5678-9099", by: "Owner" });
    expect(await correct(n, "123456789088", false)).toEqual({ ok: true, emailed: null });
    expect(shipped()).toHaveLength(1);
  });

  it("edits the recipient, address and slot until it ships, with checkout's rules, and records what changed", async () => {
    const n = await order(buyer);
    const version = () => orderDetail(n).then((d) => d!.delivery.version);
    const edit = (over: Record<string, string>, v: string) => updateDeliveryAction(n, { name: "Test Person", phone: "090-0000-0000", postal: "153-0061", line1: "1-2-3", line2: "", slot: "14_16", ...over }, v);
    const v1 = await version();
    expect(await edit({ name: " ", phone: "12", postal: "12", line1: "", slot: "midnight" }, v1)).toEqual({
      ok: false,
      errors: { name: "Enter the recipient's name.", phone: "Enter a Japanese phone number, like 090-1234-5678.", line1: "Enter the street address: block, building and number.", postal: "Enter a 7-digit postal code that exists, like 153-0061.", slot: "Choose a time slot." },
    });
    expect(await edit({ postal: "060-0001" }, v1)).toEqual({ ok: false, errors: { postal: "That postal code is outside the 23 wards, where we don't deliver." } });
    expect(await edit({}, v1)).toEqual({ ok: true, changed: false });

    expect(await edit({ name: "山田花子", postal: "1500001", line1: "4-5-6", line2: "Room 7", slot: "18_20" }, v1)).toEqual({ ok: true, changed: true });
    const o = await row(n);
    expect(o).toMatchObject({ shipToName: "山田花子", postalCode: "1500001", city: "渋谷区", line1: "4-5-6", line2: "Room 7", deliveryTimeSlot: "18_20", wardCode: expect.any(String) });
    const step = (await orderDetail(n))!.timeline.find((x) => x.title === "Delivery details changed");
    expect(step).toMatchObject({ by: "Owner" });
    expect(step!.detail).toBe(`Recipient: Test Person → 山田花子. Address: 〒153-0061 東京都目黒区中目黒1-2-3 → 〒150-0001 東京都渋谷区神宮前4-5-6 Room 7. Time slot: 14:00–16:00 → 18:00–20:00`);
    // The form had the old details: refused rather than overwriting.
    expect(await edit({ name: "Someone else" }, v1)).toEqual({ ok: false, stale: true, error: expect.stringMatching(/changed after you started editing/) });
  });

  it("refuses an edit made from details the customer has changed since, and any edit once shipped", async () => {
    const n = await order(buyer);
    const v = (await orderDetail(n))!.delivery.version;
    expect(await changeTimeSlot(buyer, n, "18_20")).toMatchObject({ ok: true, changed: true });
    expect(await updateDeliveryAction(n, { name: "X", phone: "090-0000-0000", postal: "153-0061", line1: "1", line2: "", slot: "14_16" }, v)).toEqual({ ok: false, stale: true, error: expect.stringMatching(/the customer may have changed their time slot/) });
    expect((await row(n)).deliveryTimeSlot).toBe("18_20");
    await closeDrop();
    await ship(n, "123456789012");
    const d = (await orderDetail(n))!;
    expect(d.delivery).toMatchObject({ editable: false, refusal: "It has shipped, so its delivery details can't change." });
    expect(await updateDeliveryAction(n, { name: "X", phone: "090-0000-0000", postal: "153-0061", line1: "1", line2: "", slot: "14_16" }, d.delivery.version)).toEqual({ ok: false, error: "It has shipped, so its delivery details can't change." });
    expect(await updateDeliveryAction(n, {}, 42)).toEqual({ ok: false, error: "Reload the page and try again." });
  });

  it("sends the confirmation again with the order as it is now, and the shipping email once shipped, each under a new key", async () => {
    const n = await order(buyer);
    const id = (await row(n)).id;
    mail.reset();
    await db.update(schema.orders).set({ line1: "9-9-9" }).where(eq(schema.orders.id, id));
    expect(await resendOrderEmailAction(n, "shipped")).toEqual({ ok: false, error: "It hasn't shipped yet." });
    expect(await resendOrderEmailAction(n, "confirmation")).toEqual({ ok: true, emailed: true });
    expect(await resendOrderEmailAction(n, "confirmation")).toEqual({ ok: true, emailed: true });
    const confirmations = mail.sent.filter((e) => e.type === "order_confirmation");
    expect(confirmations).toHaveLength(2);
    expect(confirmations[0].text).toContain("9-9-9");
    expect(confirmations[0].idempotencyKey).toMatch(new RegExp(`^order-confirmation/${id}/resend-\\d+$`));
    expect(await titles(n)).toContain("Confirmation resend requested");

    await closeDrop();
    await ship(n, "123456789012");
    mail.reset();
    expect(await resendOrderEmailAction(n, "shipped")).toEqual({ ok: true, emailed: true });
    expect(shipped()[0].idempotencyKey).toMatch(new RegExp(`^order-shipped/${id}/123456789012/resend-\\d+$`));
    expect(await resendOrderEmailAction(n, "bogus")).toEqual({ ok: false, error: "Reload the page and try again." });

    const gone = await order(buyer);
    await db.update(schema.orders).set({ state: "cancelled", cancelledAt: new Date() }).where(eq(schema.orders.number, gone));
    expect(await resendOrderEmailAction(gone, "confirmation")).toEqual({ ok: false, error: "It was cancelled, so there's no confirmation to send." });
  });

  it("reports a failed send without undoing the shipment", async () => {
    const n = await order(buyer);
    await closeDrop();
    mail.failing = "Resend is down";
    expect(await ship(n, "123456789012")).toEqual({ ok: true, emailed: false });
    mail.failing = null;
    expect((await row(n)).state).toBe("shipped");
    expect((await orderDetail(n))!.timeline.find((x) => x.title === "Shipping email sent")?.detail).toBe("Failed to buyer@test.invalid: Resend is down");
  });
});
