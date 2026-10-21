// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { placeOrder, startCheckout } from "@/lib/checkout";
import { ownerInbox } from "@/lib/custom-orders";
import { loadDrops, loadSettings } from "@/lib/drops";
import { ownerNotifications, saveSettings, settingsForForm } from "@/lib/settings";
import { validateSettings, type SettingValue } from "@/lib/settings-fields";
import { captureEmail, clearTestData, closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

/** The owner's settings (PRD 4.9) against a real Postgres: saving, what the site then reads, and the paid-order emails. */
const { pool, db } = testDb();
const mail = captureEmail();
const DROP = "drop-03";
const DAY = 86_400_000;
/** Keys these tests write; cleared before each so every test starts from the seed's settings. */
const WRITTEN = ["owner_email", "notify_new_order", "arrival_offset_days", "legal_seller_name", "line_url", "instagram_url", "shipping_fee", "custom_order_email", "contact_email"];

/** Save through the same validation the form uses, starting from what's stored now. */
async function save(over: Record<string, SettingValue>) {
  const r = validateSettings({ ...(await settingsForForm()), ...over });
  if (!r.ok) throw new Error("invalid: " + JSON.stringify(r.errors));
  await saveSettings(r.values);
}
async function placePaidOrder(): Promise<string> {
  const [c] = await db.insert(schema.customers).values({ email: "buyer@test.invalid", emailVerifiedAt: new Date(), name: "Test Buyer" }).returning({ id: schema.customers.id });
  const r = await startCheckout({ dropId: DROP, items: { "cookie-box": 2 }, flags: { state: "open" } }, null);
  if (!r.ok || !r.checkoutId) throw new Error("expected holds");
  const p = await placeOrder({ dropId: DROP, checkoutId: r.checkoutId, revision: r.revision!, locale: "ja", delivery: { name: "山田花子", phone: "090-1234-5678", postal: "153-0061", line1: "1-2-3", line2: "" }, gift: "おめでとう", paymentMethod: "card", timeSlot: "14_16" }, r.checkoutId, c.id);
  if (!p.ok) throw new Error("expected an order: " + p.error);
  return p.order.number;
}

describe.skipIf(!TEST_DATABASE_URL)("settings", () => {
  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    mail.reset();
    await clearTestData(db, ["order_items", "orders", "inventory_holds", "carts", "notification_log"]);
    await db.delete(schema.settings).where(inArray(schema.settings.key, WRITTEN));
    await seed(db);
  });
  afterAll(async () => {
    await clearTestData(db, ["order_items", "orders", "inventory_holds", "carts"]);
    await closeTestDb(pool);
  });

  it("shows the stored values in the form, defaults for the rest, and the seed's '#notify' as an empty link", async () => {
    const v = await settingsForForm();
    expect(v).toMatchObject({ contact_email: "hello@astrobakes.xyz", shipping_fee: 0, line_url: "", owner_email: "", notify_new_order: true, arrival_offset_days: 1, jp_item_name: "焼き菓子", jp_fragile: true });
  });

  it("saves what the form sends, and the site reads it back", async () => {
    await save({ legal_seller_name: "並川洋美", shipping_fee: 300, line_url: "https://lin.ee/abc123", arrival_offset_days: 2 });
    const s = await loadSettings();
    expect(s).toMatchObject({ legalSellerName: "並川洋美", shippingFee: 300, lineUrl: "https://lin.ee/abc123", arrivalOffsetDays: 2 });
    const rows = await db.select().from(schema.settings).where(inArray(schema.settings.key, ["shipping_fee", "notify_new_order"]));
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual({ shipping_fee: 300, notify_new_order: true });
  });

  it("falls back to the default links when the owner leaves them empty", async () => {
    await save({ line_url: "", instagram_url: "" });
    const s = await loadSettings();
    expect(s.lineUrl).toBe("#notify");
    expect(s.instagramUrl).toBe("https://instagram.com");
  });

  it("dates the expected arrival by the arrival offset, on the drop page and in the confirmation email", async () => {
    const before = (await loadDrops("en")).find((d) => d.id === DROP)!;
    expect(before.arriveAt.getTime() - before.shipAt.getTime()).toBe(DAY);
    await save({ arrival_offset_days: 2 });
    const after = (await loadDrops("en")).find((d) => d.id === DROP)!;
    expect(after.arriveAt.getTime() - after.shipAt.getTime()).toBe(2 * DAY);
    await placePaidOrder();
    const confirmation = mail.sent.find((m) => m.type === "order_confirmation")!;
    // Drop 03 ships Sun Oct 25 (JST); two days on is Tue Oct 27.
    expect(confirmation.text).toContain("10月27日");
  });

  it("sends the owner a new-order email at the owner email, with what was bought", async () => {
    await save({ owner_email: "owner@test.invalid" });
    const number = await placePaidOrder();
    const owner = mail.sent.find((m) => m.type === "internal")!;
    expect(owner).toMatchObject({ to: "owner@test.invalid", idempotencyKey: expect.stringMatching(/^owner-new-order\//) });
    expect(owner.subject).toBe(`New order ${number} · 2 boxes · ¥2,000`);
    expect(owner.text).toContain("4 Cookie Box × 2");
    expect(owner.text).toContain("To: 山田花子, 目黒区");
    expect(owner.text).toContain("Time slot: 14:00–16:00");
    expect(owner.text).toContain("Gift card: おめでとう");
    expect(mail.sent.some((m) => m.type === "order_confirmation" && m.to === "buyer@test.invalid")).toBe(true);
  });

  it("sends no owner email when it's switched off, and uses the contact email when there's no owner email", async () => {
    expect(await ownerNotifications()).toEqual({ to: "hello@astrobakes.xyz", newOrders: true });
    await save({ notify_new_order: false });
    await placePaidOrder();
    expect(mail.sent.filter((m) => m.type === "internal")).toHaveLength(0);
    expect(mail.sent.filter((m) => m.type === "order_confirmation")).toHaveLength(1);
  });

  it("sends party requests to the custom-order override, else the owner email, else the contact email", async () => {
    expect(await ownerInbox()).toBe("hello@astrobakes.xyz");
    await save({ owner_email: "owner@test.invalid" });
    expect(await ownerInbox()).toBe("owner@test.invalid");
    await db.insert(schema.settings).values({ key: "custom_order_email", value: "parties@test.invalid" });
    expect(await ownerInbox()).toBe("parties@test.invalid");
  });
});
