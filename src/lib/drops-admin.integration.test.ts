// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { duplicateDropAction, saveDropAction } from "@/app/admin/(app)/drops/actions";
import { startCheckout } from "@/lib/checkout";
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
  afterAll(async () => {
    await closeTestDb(pool);
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
    const r = await saveDropAction(await formFor("drop-04", { closeAt: "2026-11-16T21:00", boxes: [{ boxSlug: "sampler-box", cap: "12", price: "950", maxPerCustomer: "2" }, { boxSlug: "cookie-box", cap: "25", price: "1100", maxPerCustomer: "5" }] }), "drop-04");
    expect(r).toEqual({ ok: true, slug: "drop-04" });
    const d = (await dropForForm("drop-04"))!;
    expect(toJstLocal(d.closeAt)).toBe("2026-11-16T21:00");
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
