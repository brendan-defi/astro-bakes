// @vitest-environment node
import iconv from "iconv-lite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { GET } from "@/app/admin/(app)/drops/[slug]/japan-post/route";
import { cancelOrder } from "@/lib/account";
import { placeOrder, startCheckout } from "@/lib/checkout";
import { transitionDrop } from "@/lib/drops-admin";
import { japanPostLabels } from "@/lib/fulfilment";
import { JP_COL } from "@/lib/japan-post";
import { captureEmail, clearTestData, closeTestDb, resetDatabase, reseed, testDb, TEST_DATABASE_URL } from "@/test/db";

// The real route and loader, with only the admin check stubbed.
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ id: "", email: "owner@test.invalid", name: "Owner" }) }));

/** The Japan Post label file (PRD 4.6) against a real Postgres, with orders through the real checkout. */
const { pool, db } = testDb(4);
captureEmail();
const DROP = "drop-03";
const TABLES = ["order_events", "refunds", "order_items", "orders", "inventory_holds", "carts", "notification_log"];
const SENDER = { jp_sender_name: "Astro Bakes", jp_sender_postal: "154-0024", jp_sender_prefecture: "東京都", jp_sender_city: "世田谷区", jp_sender_line1: "三軒茶屋1-2-3", jp_sender_phone: "03-1234-5678" };

async function customer(email: string) {
  const [c] = await db.insert(schema.customers).values({ email, name: "Test Person", emailVerifiedAt: new Date() }).returning({ id: schema.customers.id });
  return c.id;
}
async function order(customerId: string, name: string, slot: "none" | "18_20" = "none") {
  const r = await startCheckout({ dropId: DROP, items: { "cookie-box": 1 }, flags: { state: "open" } }, null);
  if (!r.ok || !r.checkoutId) throw new Error("expected holds");
  const p = await placeOrder({ dropId: DROP, checkoutId: r.checkoutId, revision: r.revision!, locale: "ja", delivery: { name, phone: "090-1234-5678", postal: "153-0061", line1: "1-2-3", line2: "" }, gift: null, paymentMethod: "card", timeSlot: slot }, r.checkoutId, customerId);
  if (!p.ok) throw new Error("expected an order: " + p.error);
  return p.order.number;
}
const get = (slug: string) => GET(new Request(`http://localhost/admin/drops/${slug}/japan-post`), { params: Promise.resolve({ slug }) });
const setSender = (values: Record<string, string>) => Promise.all(Object.entries(values).map(([key, value]) => db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } })));

describe.skipIf(!TEST_DATABASE_URL)("Japan Post label file", { timeout: 60_000 }, () => {
  let buyer: string;

  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    await clearTestData(db, TABLES);
    await reseed(db);
    await db.update(schema.drops).set({ state: "open", closeAt: new Date(Date.now() + 3_600_000) }).where(eq(schema.drops.slug, DROP));
    await db.execute(sql`update drop_boxes set sold_qty = 0`);
    await db.execute(sql`delete from settings where key like 'jp_%'`);
    buyer = await customer("buyer@test.invalid");
  });
  afterAll(async () => {
    await closeTestDb(pool);
  });

  it("labels every order still to ship, by number, and none that's shipped, cancelled or unpaid", async () => {
    await setSender(SENDER);
    const a = await order(buyer, "山田花子", "18_20");
    const b = await order(buyer, "髙橋 一郎");
    const sent = await order(buyer, "Shipped Person");
    const gone = await order(buyer, "Cancelled Person");
    expect(await cancelOrder(buyer, gone)).toMatchObject({ ok: true });
    await db.update(schema.orders).set({ state: "shipped", shippedAt: new Date(), trackingNumber: "123456789012" }).where(eq(schema.orders.number, sent));
    const unpaid = await order(buyer, "Unpaid Person");
    await db.update(schema.orders).set({ state: "pending_payment", paidAt: null }).where(eq(schema.orders.number, unpaid));
    await transitionDrop(DROP, "close");
    await db.update(schema.orders).set({ state: "packed", packedAt: new Date() }).where(eq(schema.orders.number, b));

    const labels = (await japanPostLabels(DROP))!;
    expect(labels.warning).toBeNull();
    expect(labels.file.fileProblems).toEqual([]);
    expect(labels.file.rows).toEqual([{ number: a, problems: [] }, { number: b, problems: ["The recipient's name has 髙, which may print wrongly on the label."] }]);

    const res = await get(DROP);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=Shift_JIS");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="japan-post-${DROP}.csv"`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const lines = iconv.decode(Buffer.from(await res.arrayBuffer()), "cp932").split("\r\n").filter(Boolean).map((l) => l.split(","));
    expect(lines.map((l) => l.length)).toEqual([72, 72]);
    const col = (row: string[], c: number) => row[c - 1];
    expect(lines.map((l) => [col(l, JP_COL.toName), col(l, JP_COL.slot), col(l, JP_COL.toPostal), col(l, JP_COL.toCity)])).toEqual([
      ["山田花子", "55", "1530061", "目黒区中目黒"],
      ["髙橋　一郎", "00", "1530061", "目黒区中目黒"],
    ]);
    const [ship] = await db.select({ shipAt: schema.drops.shipAt }).from(schema.drops).where(eq(schema.drops.slug, DROP));
    const ymd = (d: Date) => new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
    expect(col(lines[0], JP_COL.sendDate)).toBe(ymd(ship.shipAt));
    expect(col(lines[0], JP_COL.deliveryDate)).toBe(ymd(new Date(ship.shipAt.getTime() + 86_400_000)));
    expect(col(lines[0], JP_COL.fromName)).toBe("Ａｓｔｒｏ　Ｂａｋｅｓ");
    expect(col(lines[0], JP_COL.note)).toBe("ＡＢ－００３－００１");
  });

  it("refuses the file until the sender is filled in, and says what's missing", async () => {
    await order(buyer, "山田花子");
    await transitionDrop(DROP, "close");
    const res = await get(DROP);
    expect(res.status).toBe(409);
    expect(await res.text()).toBe(["Sender name is empty.", "Sender postal code is empty.", "Sender city / ward is empty.", "Sender address is empty.", "Sender phone is empty."].map((p) => `${p} Fill it in under Settings → Shipping.`).join("\n"));
  });

  it("warns while the drop is open, refuses with no orders, and 404s an unknown or malformed drop", async () => {
    await setSender(SENDER);
    await order(buyer, "山田花子");
    expect((await japanPostLabels(DROP))!.warning).toMatch(/still open/);
    await db.delete(schema.orderItems);
    await db.delete(schema.orders);
    expect((await get(DROP)).status).toBe(409);
    expect((await get("no-such-drop")).status).toBe(404);
    expect((await get("../etc")).status).toBe(404);
  });
});
