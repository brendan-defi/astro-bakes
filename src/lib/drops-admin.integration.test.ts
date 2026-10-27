// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { duplicateDropAction, saveDropAction, transitionDropAction } from "@/app/admin/(app)/drops/actions";
import { cancelOrder, loadOrders } from "@/lib/account";
import { placeOrder, startCheckout } from "@/lib/checkout";
import { effectiveState, getHome, settings as defaultSettings } from "@/lib/data";
import { loadDrops } from "@/lib/drops";
import { nextMonth, toJstDay, toJstLocal } from "@/lib/drop-rules";
import { dropForForm, listDropsAdmin } from "@/lib/drops-admin";
import { closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

// The real actions, with only the admin check and Next's cache stubbed; redirect() throws as Next's does.
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ id: "admin", email: "owner@test.invalid", name: null }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); } }));

/** The drop editor (PRD 4.2) against a real Postgres, starting from the seeded drops (03: closed by the clock; 04: scheduled for November). */
const { pool, db } = testDb();
const DAY = 86_400_000;

const newDrop = (over: Record<string, unknown> = {}) => ({
  number: "5", nameEn: "Drop 05 · December", nameJa: "ドロップ05 · 12月", descriptionEn: "", descriptionJa: "",
  openAt: "2026-12-06T10:00", closeAt: "2026-12-13T21:00", bakeAt: "", shipAt: "2026-12-20",
  boxes: [{ boxSlug: "cookie-box", cap: "20", price: "1000", maxPerCustomer: "5" }, { boxSlug: "banana-bread", cap: "10", price: "500", maxPerCustomer: "3" }],
  ...over,
});
/** The edit form as it would arrive for an existing drop: its current values, with changes on top. */
async function formFor(slug: string, over: Record<string, unknown> = {}) {
  const d = (await dropForForm(slug))!;
  return {
    nameEn: d.nameEn, nameJa: d.nameJa, descriptionEn: d.descriptionEn, descriptionJa: d.descriptionJa,
    openAt: toJstLocal(d.openAt), closeAt: toJstLocal(d.closeAt), bakeAt: d.bakeAt ? toJstLocal(d.bakeAt) : "", shipAt: toJstDay(d.shipAt),
    boxes: d.boxes.map((b) => ({ boxSlug: b.boxSlug, cap: String(b.cap), price: String(b.price), maxPerCustomer: String(b.maxPerCustomer) })),
    ...over,
  };
}
/** Make Drop 03 open right now (closing in a day), as if the owner had opened it. */
const openDrop03 = () => db.update(schema.drops).set({ state: "open", closeAt: new Date(Date.now() + DAY) }).where(eq(schema.drops.slug, "drop-03"));

describe.skipIf(!TEST_DATABASE_URL)("drop editor", () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });

  it("lists drops newest first with the state the shop sees, sold against cap, and paid revenue", async () => {
    const list = await listDropsAdmin();
    expect(list.map((d) => [d.slug, d.state])).toEqual([["drop-04", "scheduled"], ["drop-03", "closed"]]);
    expect(list[1]).toMatchObject({ sold: 30, cap: 40, orders: 0, revenue: 0 });
  });

  it("creates a draft numbered as given, with its boxes; drafts stay off the shop", async () => {
    expect(await saveDropAction(newDrop(), null)).toEqual({ ok: true, slug: "drop-05" });
    const d = await dropForForm("drop-05");
    expect(d).toMatchObject({ number: 5, state: "draft", nameJa: "ドロップ05 · 12月", boxes: [{ boxSlug: "cookie-box", cap: 20, price: 1000 }, { boxSlug: "banana-bread", cap: 10, price: 500, maxPerCustomer: 3 }] });
    expect(d!.openAt.toISOString()).toBe("2026-12-06T01:00:00.000Z");
    expect(await saveDropAction(newDrop(), null)).toEqual({ ok: false, errors: { number: "Another drop already has this number." } });
  });

  it("edits everything before the drop opens: dates, boxes in and out, prices", async () => {
    // A day later than the fixture's close (which reseed() pins to the clock), still before its bake and ship dates.
    const closeAt = toJstLocal(new Date((await dropForForm("drop-04"))!.closeAt.getTime() + DAY));
    const r = await saveDropAction(await formFor("drop-04", { closeAt, boxes: [{ boxSlug: "sampler-box", cap: "12", price: "950", maxPerCustomer: "2" }, { boxSlug: "cookie-box", cap: "25", price: "1100", maxPerCustomer: "5" }] }), "drop-04");
    expect(r).toEqual({ ok: true, slug: "drop-04" });
    const d = (await dropForForm("drop-04"))!;
    expect(toJstLocal(d.closeAt)).toBe(closeAt);
    expect(d.boxes.map((b) => [b.boxSlug, b.cap, b.price])).toEqual([["sampler-box", 12, 950], ["cookie-box", 25, 1100]]);
  });

  it("once open, changes names, caps and limits but keeps dates, boxes and prices as customers saw them", async () => {
    await openDrop03();
    const before = (await dropForForm("drop-03"))!;
    const r = await saveDropAction(await formFor("drop-03", {
      nameEn: "Drop 03 · October (extended)",
      openAt: "2026-01-01T10:00",
      // A new price is sent too, and ignored: customers may have paid the old one.
      boxes: before.boxes.map((b) => ({ boxSlug: b.boxSlug, cap: String(b.boxSlug === "cookie-box" ? 30 : b.cap), price: "999", maxPerCustomer: "4" })),
    }), "drop-03");
    expect(r).toEqual({ ok: true, slug: "drop-03" });
    const after = (await dropForForm("drop-03"))!;
    expect(after.nameEn).toBe("Drop 03 · October (extended)");
    expect(after.openAt).toEqual(before.openAt);
    expect(after.boxes.find((b) => b.boxSlug === "cookie-box")).toMatchObject({ cap: 30, maxPerCustomer: 4, price: before.boxes.find((b) => b.boxSlug === "cookie-box")!.price });
  });

  it("refuses removing or adding boxes once open, saving nothing", async () => {
    await openDrop03();
    const r = await saveDropAction(await formFor("drop-03", { nameEn: "Renamed", boxes: [{ boxSlug: "cookie-box", cap: "20", price: "1000", maxPerCustomer: "5" }] }), "drop-03");
    expect(r).toEqual({ ok: false, errors: { boxes: "Boxes can't be added or removed once the drop has opened." } });
    expect((await dropForForm("drop-03"))!.nameEn).toBe("Drop 03 · October");
  });

  it("never lets a cap fall below what's sold plus what checkouts hold right now", async () => {
    await openDrop03();
    // 13 of 20 cookie boxes sold; a checkout holds 2 more.
    const hold = await startCheckout({ dropId: "drop-03", items: { "cookie-box": 2 } }, null);
    expect(hold.ok).toBe(true);
    const form = await formFor("drop-03");
    const capTo = (n: number) => ({ ...form, boxes: form.boxes.map((b) => (b.boxSlug === "cookie-box" ? { ...b, cap: String(n) } : b)) });
    const r = await saveDropAction(capTo(14), "drop-03");
    expect(r.ok === false && Object.values(r.errors)[0]).toBe("At least 15: 13 sold, 2 in checkouts right now.");
    expect(await saveDropAction(capTo(15), "drop-03")).toEqual({ ok: true, slug: "drop-03" });
  });

  it("won't remove a box that has sales, even before opening", async () => {
    await saveDropAction(newDrop(), null);
    await db.update(schema.dropBoxes).set({ soldQty: 1 }).where(eq(schema.dropBoxes.dropId, (await db.query.drops.findFirst({ where: eq(schema.drops.slug, "drop-05") }))!.id));
    const r = await saveDropAction(await formFor("drop-05", { boxes: [{ boxSlug: "cookie-box", cap: "20", price: "1000", maxPerCustomer: "5" }] }), "drop-05");
    expect(r).toEqual({ ok: false, errors: { boxes: "A box that has orders can't be removed." } });
  });

  it("keeps a scheduled drop's opening in the future", async () => {
    const r = await saveDropAction(await formFor("drop-04", { openAt: "2026-01-01T10:00" }), "drop-04");
    expect(r.ok === false && r.errors.openAt).toMatch(/Open now/);
  });

  it("duplicates into the next-numbered draft, a month later, with the boxes and nothing sold", async () => {
    const source = (await dropForForm("drop-03"))!;
    const go = await duplicateDropAction("drop-03").catch((e: { to?: string }) => e.to);
    expect(go).toBe("/admin/drops/drop-05?duplicated=1");
    const copy = (await dropForForm("drop-05"))!;
    expect(copy).toMatchObject({ number: 5, state: "draft", nameEn: "Drop 03 · October (copy)", nameJa: "ドロップ03 · 10月（コピー）" });
    // The seed's dates are pinned to the clock by reseed() in test/db.ts, so compare with the rule rather than a calendar date.
    expect(toJstLocal(copy.openAt)).toBe(toJstLocal(nextMonth(source.openAt)));
    expect(toJstDay(copy.shipAt)).toBe(toJstDay(nextMonth(source.shipAt)));
    expect(copy.openAt.getTime()).toBeGreaterThan(source.openAt.getTime() + 27 * DAY);
    expect(copy.boxes.map((b) => [b.boxSlug, b.cap, b.sold])).toEqual([["cookie-box", 20, 0], ["banana-bread", 10, 0], ["sampler-box", 10, 0]]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("drop editor, review follow-ups", () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });
  const setState = (slug: string, state: "shipped" | "complete" | "cancelled") => db.update(schema.drops).set({ state }).where(eq(schema.drops.slug, slug));
  const boxRows = (slug: string) => db.select({ cap: schema.dropBoxes.cap, price: schema.dropBoxes.price }).from(schema.dropBoxes).innerJoin(schema.drops, eq(schema.drops.id, schema.dropBoxes.dropId)).where(eq(schema.drops.slug, slug)).orderBy(schema.dropBoxes.sort);

  it.each(["shipped", "complete", "cancelled"] as const)("saves a name and description change on a %s drop, leaving its boxes alone", async (state) => {
    await setState("drop-03", state);
    const before = await boxRows("drop-03");
    const form = await formFor("drop-03", { nameEn: "Drop 03 · October (renamed)", descriptionJa: "完売御礼。", boxes: (await formFor("drop-03")).boxes.map((b) => ({ ...b, cap: "999", price: "9999" })) });
    expect(await saveDropAction(form, "drop-03", state)).toEqual({ ok: true, slug: "drop-03" });
    const after = (await dropForForm("drop-03"))!;
    expect(after).toMatchObject({ state, nameEn: "Drop 03 · October (renamed)", descriptionJa: "完売御礼。" });
    expect(await boxRows("drop-03")).toEqual(before); // caps and prices ignored, not applied
  });

  it("refuses a save drawn for a scheduled drop once it has opened, so the form can't call ignored dates and prices saved", async () => {
    const form = await formFor("drop-04", { shipAt: "2026-12-24", boxes: (await formFor("drop-04")).boxes.map((b) => ({ ...b, price: "1234" })) });
    const stored = (await dropForForm("drop-04"))!;
    // The owner's tab is still on the scheduled form; meanwhile the drop opens (the next PR's "Open now", or the clock).
    await db.update(schema.drops).set({ state: "open", openAt: new Date(Date.now() - 3_600_000), closeAt: new Date(Date.now() + DAY) }).where(eq(schema.drops.slug, "drop-04"));
    const r = await saveDropAction(form, "drop-04", "scheduled");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors).toEqual({ state: expect.stringMatching(/^This drop is now open, .*Reload the page/) });
    const now = (await dropForForm("drop-04"))!;
    expect([toJstDay(now.shipAt), now.boxes.map((b) => b.price)]).toEqual([toJstDay(stored.shipAt), stored.boxes.map((b) => b.price)]);
    // A form drawn for the drop as it is now goes through, names only changing.
    expect(await saveDropAction(await formFor("drop-04", { nameEn: "Drop 04 · November!" }), "drop-04", "open")).toEqual({ ok: true, slug: "drop-04" });
  });

  it("still saves across states that lock the same fields (closed to baking), and without a drawn-for state", async () => {
    await db.update(schema.drops).set({ state: "baking" }).where(eq(schema.drops.slug, "drop-03"));
    expect(await saveDropAction(await formFor("drop-03", { nameEn: "Baking now" }), "drop-03", "closed")).toEqual({ ok: true, slug: "drop-03" });
    expect(await saveDropAction(await formFor("drop-03", { nameEn: "No state sent" }), "drop-03")).toEqual({ ok: true, slug: "drop-03" });
  });

  it("New drop and Duplicate take numbers in turn: a duplicate waits for an uncommitted creation, then numbers after it", async () => {
    // Another tab is creating number 5 and hasn't committed yet: hold the numbering lock with its row inserted.
    const other = await pool!.connect();
    await other.query("begin");
    await other.query("select pg_advisory_xact_lock(hashtext('drop-number'))");
    await other.query("insert into drops (number, slug, name_en, state, open_at, close_at, ship_at) values (5, 'drop-05', 'Drop 05', 'draft', now(), now() + interval '1 day', now() + interval '3 days')");
    let settled = false;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // Postgres grants a contended lock to waiters in the order they queued: the duplicate first, then the creation.
    const dup = duplicateDropAction("drop-03").catch((e: { to?: string }) => e.to).finally(() => { settled = true; });
    await wait(250);
    const creating = saveDropAction(newDrop({ number: "7" }), null).finally(() => { settled = true; });
    await wait(250);
    expect(settled).toBe(false); // both wait for the lock rather than racing the uncommitted row
    await other.query("commit");
    other.release();
    expect(await dup).toBe("/admin/drops/drop-06?duplicated=1");
    expect(await creating).toEqual({ ok: true, slug: "drop-07" });
    expect((await listDropsAdmin()).map((d) => d.number)).toEqual([7, 6, 5, 4, 3]);
  });

  it("carries the description to the homepage model in each language, English standing in for a missing Japanese line", async () => {
    const { loadDrops } = await import("@/lib/drops");
    expect(await saveDropAction(await formFor("drop-04", { descriptionEn: "Matcha season: two new cookies.", descriptionJa: "抹茶の季節。新作クッキー2種。" }), "drop-04", "scheduled")).toEqual({ ok: true, slug: "drop-04" });
    const en = (await loadDrops("en")).find((d) => d.id === "drop-04")!;
    const ja = (await loadDrops("ja")).find((d) => d.id === "drop-04")!;
    expect([en.description, ja.description]).toEqual(["Matcha season: two new cookies.", "抹茶の季節。新作クッキー2種。"]);
    expect(await saveDropAction(await formFor("drop-04", { descriptionJa: "" }), "drop-04", "scheduled")).toEqual({ ok: true, slug: "drop-04" });
    expect((await loadDrops("ja")).find((d) => d.id === "drop-04")!.description).toBe("Matcha season: two new cookies.");
    expect(await saveDropAction(await formFor("drop-04", { descriptionEn: "", descriptionJa: "" }), "drop-04", "scheduled")).toEqual({ ok: true, slug: "drop-04" });
    expect((await loadDrops("en")).find((d) => d.id === "drop-04")!.description).toBeUndefined();
  });
});

afterAll(async () => {
  await closeTestDb(pool);
});

describe.skipIf(!TEST_DATABASE_URL)("drop lifecycle (PRD 5.2a)", () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });
  const stored = async (slug: string) => (await db.query.drops.findFirst({ where: eq(schema.drops.slug, slug) }))!;
  const at = (days: number) => new Date(Date.now() + days * DAY);
  /** A new draft six weeks out, whatever the clock says. */
  const futureDrop = () => newDrop({ openAt: toJstLocal(at(42)), closeAt: toJstLocal(at(49)), shipAt: toJstDay(at(56)) });
  const shop = async () => getHome({}, { drops: await loadDrops("en"), catalogue: [], settings: defaultSettings });
  const near = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < 5_000;
  /** A customer with a paid order in the given drop, placed through the real checkout. */
  async function paidOrder(slug: string, email: string) {
    const [c] = await db.insert(schema.customers).values({ email, emailVerifiedAt: new Date(), name: "Test Person", phone: "090-0000-0000" }).returning({ id: schema.customers.id });
    const r = await startCheckout({ dropId: slug, items: { "cookie-box": 1 }, flags: { state: "open" } }, null);
    if (!r.ok || !r.checkoutId) throw new Error("expected holds");
    const p = await placeOrder({ dropId: slug, checkoutId: r.checkoutId, revision: r.revision!, locale: "en", delivery: { name: "Test Person", phone: "090-0000-0000", postal: "153-0061", line1: "1-2-3", line2: "" }, gift: null, paymentMethod: "card" }, r.checkoutId, c.id);
    if (!p.ok) throw new Error("expected order: " + p.error);
    return { customerId: c.id, number: p.order.number };
  }

  it("schedules a draft, which the shop then shows as coming up; a draft that would already be open is sent to Open now", async () => {
    await saveDropAction(futureDrop(), null); // drop-05, six weeks out
    expect(await transitionDropAction("drop-05", "schedule")).toEqual({ ok: true, state: "scheduled" });
    expect((await dropForForm("drop-05"))!).toMatchObject({ state: "scheduled", storedState: "scheduled" });
    expect(await transitionDropAction("drop-05", "unschedule")).toEqual({ ok: true, state: "draft" });
    await db.update(schema.drops).set({ openAt: new Date(Date.now() - DAY) }).where(eq(schema.drops.slug, "drop-05"));
    expect(await transitionDropAction("drop-05", "schedule")).toEqual({ ok: false, error: "A scheduled drop has to open in the future. To open it now, use Open now." });
  });

  it("won't schedule over another drop's window, and won't open while another drop is open", async () => {
    const d04 = await stored("drop-04"); // scheduled, two weeks out
    await saveDropAction(newDrop({ openAt: toJstLocal(new Date(d04.openAt.getTime() + DAY)), closeAt: toJstLocal(new Date(d04.closeAt.getTime() + DAY)), shipAt: toJstDay(new Date(d04.shipAt.getTime() + DAY)) }), null);
    expect(await transitionDropAction("drop-05", "schedule")).toEqual({ ok: false, error: "Drop 04 is scheduled over those dates. Only one drop can be open at a time; change the dates first." });
    expect(await transitionDropAction("drop-04", "open")).toEqual({ ok: true, state: "open" });
    expect(await transitionDropAction("drop-05", "open")).toEqual({ ok: false, error: "Drop 04 is open now. Close it first; only one drop can be open at a time." });
  });

  it("opens now: the opening time becomes now, the shop sells it, and the editor locks what customers have seen", async () => {
    const before = new Date();
    expect(await transitionDropAction("drop-04", "open")).toEqual({ ok: true, state: "open" });
    const d = await stored("drop-04");
    expect(d.state).toBe("open");
    expect(near(d.openAt, before)).toBe(true);
    expect(await shop()).toMatchObject({ state: "open", drop: { id: "drop-04" }, soldOut: false });
    expect((await dropForForm("drop-04"))!.state).toBe("open");
    const r = await saveDropAction(await formFor("drop-04", { nameEn: "Live!", shipAt: "2027-01-01" }), "drop-04", "open");
    expect(r).toEqual({ ok: true, slug: "drop-04" });
    expect(toJstDay((await stored("drop-04")).shipAt)).toBe(toJstDay(d.shipAt)); // the date change was ignored, the name saved
  });

  it("closes now: no new checkouts, the customer's free cancellation ends, and the drop can reopen until a new closing time", async () => {
    await transitionDropAction("drop-04", "open");
    const { customerId } = await paidOrder("drop-04", "buyer@test.invalid");
    expect((await loadOrders(customerId, "en"))[0]).toMatchObject({ status: "confirmed", canCancel: true });
    const before = new Date();
    expect(await transitionDropAction("drop-04", "close")).toEqual({ ok: true, state: "closed" });
    const d = await stored("drop-04");
    expect(near(d.closeAt, before)).toBe(true);
    expect((await loadOrders(customerId, "en"))[0]).toMatchObject({ status: "confirmed", canCancel: false });
    expect((await startCheckout({ dropId: "drop-04", items: { "cookie-box": 1 }, flags: {} }, null)).ok).toBe(false);
    expect((await shop()).state).toBe("closed"); // the homepage's closed hero (Drop 03, still to ship, comes first)
    expect((await dropForForm("drop-04"))!.state).toBe("closed");
    // Reopen: the new closing time has to be ahead of now and before the ship date.
    expect(await transitionDropAction("drop-04", "reopen", { closeAt: toJstLocal(new Date(Date.now() - 3_600_000)) })).toEqual({ ok: false, error: "The new closing time has to be in the future." });
    expect(await transitionDropAction("drop-04", "reopen", { closeAt: toJstLocal(new Date(d.shipAt.getTime() + 3_600_000)) })).toEqual({ ok: false, error: "The new closing time has to be before the ship date." });
    expect(await transitionDropAction("drop-04", "reopen", {})).toEqual({ ok: false, error: "Pick a new closing time." });
    const until = new Date(Date.now() + 2 * DAY);
    expect(await transitionDropAction("drop-04", "reopen", { closeAt: toJstLocal(until) })).toEqual({ ok: true, state: "open" });
    expect(toJstLocal((await stored("drop-04")).closeAt)).toBe(toJstLocal(until)); // entered to the minute
    expect((await loadOrders(customerId, "en"))[0].canCancel).toBe(true);
  });

  it("baking, shipped, complete: complete delivers the shipped orders and leaves the rest", async () => {
    await transitionDropAction("drop-04", "open");
    const a = await paidOrder("drop-04", "a@test.invalid");
    const b = await paidOrder("drop-04", "b@test.invalid");
    await transitionDropAction("drop-04", "close");
    expect(await transitionDropAction("drop-04", "baking")).toEqual({ ok: true, state: "baking" });
    expect((await loadOrders(a.customerId, "en"))[0].status).toBe("baking");
    expect(await transitionDropAction("drop-04", "complete")).toEqual({ ok: false, error: "Mark complete isn't available: the drop is baking." });
    expect(await transitionDropAction("drop-04", "shipped")).toEqual({ ok: true, state: "shipped" });
    await db.update(schema.orders).set({ state: "shipped", shippedAt: new Date() }).where(eq(schema.orders.number, a.number));
    expect(await transitionDropAction("drop-04", "complete")).toEqual({ ok: true, state: "complete" });
    expect((await loadOrders(a.customerId, "en"))[0].status).toBe("delivered");
    expect((await loadOrders(b.customerId, "en"))[0].status).toBe("baking"); // never shipped: not touched
    expect((await dropForForm("drop-04"))!).toMatchObject({ state: "complete", storedState: "complete" });
    expect(await transitionDropAction("drop-04", "complete")).toMatchObject({ ok: false });
  });

  it("turns down an unknown action and a drop that doesn't exist", async () => {
    expect(await transitionDropAction("drop-04", "launch")).toEqual({ ok: false, error: "That isn't a lifecycle action." });
    expect(await transitionDropAction("drop-99", "schedule")).toEqual({ ok: false, error: "That drop no longer exists." });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("one open drop at a time, across future windows (review of #31)", () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });
  const at = (days: number) => new Date(Date.now() + days * DAY);
  const window = (open: number, close: number, ship: number) => ({ openAt: toJstLocal(at(open)), closeAt: toJstLocal(at(close)), shipAt: toJstDay(at(ship)) });
  /** Which drops the shop would see as open on a given day, from the stored dates and states. */
  const openOn = async (day: number) => (await loadDrops("en")).filter((d) => effectiveState(d, at(day)) === "open").map((d) => d.id);
  const clash04 = { ok: false, error: "Drop 04 is scheduled over those dates. Only one drop can be open at a time; change the dates first." };

  it("A: Open now looks ahead; a scheduled drop that would open before this one closes refuses it", async () => {
    await saveDropAction(newDrop(window(28, 35, 42)), null); // Drop 04 is scheduled for days 14 to 21
    expect(await transitionDropAction("drop-05", "schedule")).toEqual({ ok: true, state: "scheduled" });
    expect(await transitionDropAction("drop-05", "open")).toEqual(clash04);
    expect(await openOn(15)).toEqual(["drop-04"]); // Drop 04 alone, when its day comes
    expect(await transitionDropAction("drop-04", "unschedule")).toEqual({ ok: true, state: "draft" });
    expect(await transitionDropAction("drop-05", "open")).toEqual({ ok: true, state: "open" });
    expect(await openOn(15)).toEqual(["drop-05"]);
  });

  it("B: Reopen can't run into the next scheduled drop", async () => {
    await saveDropAction(newDrop(window(1, 7, 10)), null);
    expect(await transitionDropAction("drop-05", "open")).toEqual({ ok: true, state: "open" });
    expect(await transitionDropAction("drop-05", "close")).toEqual({ ok: true, state: "closed" });
    expect(await transitionDropAction("drop-05", "reopen", { closeAt: toJstLocal(at(9)) })).toEqual({ ok: true, state: "open" });
    expect(await transitionDropAction("drop-05", "close")).toEqual({ ok: true, state: "closed" });
    await db.update(schema.drops).set({ shipAt: at(40) }).where(eq(schema.drops.slug, "drop-05")); // room to reopen past Drop 04
    expect(await transitionDropAction("drop-05", "reopen", { closeAt: toJstLocal(at(28)) })).toEqual(clash04);
    expect(await openOn(15)).toEqual(["drop-04"]);
  });

  it("C: saving a scheduled drop's dates can't move it onto another drop's window", async () => {
    await saveDropAction(newDrop(window(28, 35, 42)), null);
    await transitionDropAction("drop-05", "schedule");
    const onto04 = await formFor("drop-05", window(15, 22, 29));
    expect(await saveDropAction(onto04, "drop-05", "scheduled")).toEqual({ ok: false, errors: { openAt: clash04.error } });
    expect(await openOn(16)).toEqual(["drop-04"]);
    expect(await saveDropAction(await formFor("drop-05", window(22, 29, 36)), "drop-05", "scheduled")).toEqual({ ok: true, slug: "drop-05" }); // after Drop 04 closes
    expect(await openOn(16)).toEqual(["drop-04"]);
    expect(await openOn(25)).toEqual(["drop-05"]);
  });

  it("a date save and an Open now that would collide wait for the same lock; only one goes through", async () => {
    await saveDropAction(newDrop(window(28, 35, 42)), null);
    await transitionDropAction("drop-05", "schedule");
    const other = await pool!.connect();
    await other.query("begin");
    await other.query("select pg_advisory_xact_lock(hashtext('drop-lifecycle'))");
    let settled = 0;
    const save = saveDropAction(await formFor("drop-05", window(15, 22, 29)), "drop-05", "scheduled").finally(() => settled++);
    const open = transitionDropAction("drop-04", "open").finally(() => settled++);
    await new Promise((r) => setTimeout(r, 400));
    expect(settled).toBe(0);
    await other.query("commit");
    other.release();
    const [s, o] = await Promise.all([save, open]);
    expect([s.ok, o.ok].filter(Boolean).length).toBe(1);
    expect((await openOn(16)).length).toBe(1);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("Mark complete and a customer's request on the same order (review of #31)", () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });
  async function shippedDrop04() {
    await transitionDropAction("drop-04", "open");
    const [c] = await db.insert(schema.customers).values({ email: "ship@test.invalid", emailVerifiedAt: new Date(), name: "Test Person", phone: "090-0000-0000" }).returning({ id: schema.customers.id });
    const r = await startCheckout({ dropId: "drop-04", items: { "cookie-box": 1 }, flags: { state: "open" } }, null);
    if (!r.ok || !r.checkoutId) throw new Error("expected holds");
    const p = await placeOrder({ dropId: "drop-04", checkoutId: r.checkoutId, revision: r.revision!, locale: "en", delivery: { name: "Test Person", phone: "090-0000-0000", postal: "153-0061", line1: "1-2-3", line2: "" }, gift: null, paymentMethod: "card" }, r.checkoutId, c.id);
    if (!p.ok) throw new Error(p.error);
    await transitionDropAction("drop-04", "close");
    await transitionDropAction("drop-04", "baking");
    await transitionDropAction("drop-04", "shipped");
    await db.update(schema.orders).set({ state: "shipped", shippedAt: new Date() }).where(eq(schema.orders.number, p.order.number));
    return { customerId: c.id, number: p.order.number };
  }

  it("takes the locks in the customer's order (order, then drop), so neither side deadlocks", async () => {
    const { customerId, number } = await shippedDrop04();
    // A customer request has the order row and is about to take the drop row.
    const customer = await pool!.connect();
    await customer.query("begin");
    await customer.query("select id from orders where number = $1 for update", [number]);
    const complete = transitionDropAction("drop-04", "complete");
    await new Promise((r) => setTimeout(r, 300));
    await customer.query("select id from drops where slug = 'drop-04' for update"); // free: completion is waiting on the order, not holding the drop
    await customer.query("commit");
    customer.release();
    expect(await complete).toEqual({ ok: true, state: "complete" });
    expect((await loadOrders(customerId, "en"))[0].status).toBe("delivered");
  });

  it("a real cancellation racing a completion: both settle, no deadlock error", async () => {
    const { customerId, number } = await shippedDrop04();
    const [cancel, complete] = await Promise.all([cancelOrder(customerId, number), transitionDropAction("drop-04", "complete")]);
    expect(cancel).toEqual({ ok: false, error: "closed" }); // shipped orders can't be cancelled
    expect(complete).toEqual({ ok: true, state: "complete" });
  });
});
