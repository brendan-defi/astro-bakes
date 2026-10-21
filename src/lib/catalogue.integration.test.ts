// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { saveBoxAction } from "@/app/admin/(app)/boxes/actions";
import { saveItemAction } from "@/app/admin/(app)/items/actions";
import { boxBySlug, itemBySlug, listBoxes, listItems } from "@/lib/catalogue";
import { loadCatalogue, loadDrops } from "@/lib/drops";
import { closeTestDb, resetDatabase, testDb, TEST_DATABASE_URL } from "@/test/db";

// The real save actions, with only the admin check and Next's cache stubbed.
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ id: "admin", email: "owner@test.invalid", name: null }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** The box and item editors (PRD 4.3) against a real Postgres, starting from the seeded catalogue. */
const { pool, db } = testDb();

const newBox = (over: Record<string, unknown> = {}) => ({
  slug: "brownie-box", nameEn: "Brownie Box", nameJa: "ブラウニーボックス", descriptionEn: "Fudgy.", descriptionJa: "しっとり。", contentsEn: "4 brownies", contentsJa: "ブラウニー 4個",
  price: "1200", allergens: ["Egg", "Milk", "Wheat"], active: true, defaultCap: "15", defaultMaxPerCustomer: "3", sort: "5",
  recipe: [{ itemSlug: "cookie-american-choc-chip", qty: "2" }, { itemSlug: "midnight-choc-cake-slice", qty: "1" }], ...over,
});

describe.skipIf(!TEST_DATABASE_URL)("catalogue editor", () => {
  beforeEach(async () => {
    // A fresh seeded catalogue for every test.
    await resetDatabase(db);
  });
  afterAll(async () => {
    await closeTestDb(pool);
  });

  it("lists the seeded items with how many boxes use each, and boxes with their recipes", async () => {
    const items = await listItems();
    expect(items.find((i) => i.slug === "cookie-american-choc-chip")).toMatchObject({ productionUnit: "cookie", unitsPerProductionUnit: 1, boxes: 2 });
    const boxes = await listBoxes();
    expect(boxes.map((b) => b.slug)).toEqual(["cookie-box", "banana-bread", "sampler-box"]);
    expect(boxes.find((b) => b.slug === "sampler-box")).toMatchObject({ price: 900, drops: 2, recipe: expect.stringContaining("2 × American chocolate chip cookie") });
  });

  it("creates an item, refuses a taken slug, and edits without touching the slug", async () => {
    expect(await saveItemAction({ slug: "brownie", nameEn: "Brownie", nameJa: "ブラウニー", productionUnit: "tray", unitsPerProductionUnit: "16" }, null)).toMatchObject({ ok: true, slug: "brownie" });
    expect(await saveItemAction({ slug: "brownie", nameEn: "Brownie 2", nameJa: "ブラウニー2", productionUnit: "tray", unitsPerProductionUnit: "16" }, null)).toEqual({ ok: false, errors: { slug: "Another item already has this slug." } });
    const edit = await saveItemAction({ slug: "ignored", nameEn: "Fudge brownie", nameJa: "ファッジブラウニー", productionUnit: "tray", unitsPerProductionUnit: "12" }, "brownie");
    expect(edit).toMatchObject({ ok: true, slug: "brownie", value: { slug: "brownie", unitsPerProductionUnit: 12 } });
    expect(await itemBySlug("brownie")).toMatchObject({ nameEn: "Fudge brownie", unitsPerProductionUnit: 12 });
    expect(await itemBySlug("ignored")).toBeNull();
  });

  it("creates a box with its recipe, and the shop's menu shows it in both languages", async () => {
    const r = await saveBoxAction(newBox(), null);
    expect(r).toMatchObject({ ok: true, slug: "brownie-box" });
    expect(await boxBySlug("brownie-box")).toMatchObject({ price: 1200, defaultCap: 15, defaultMaxPerCustomer: 3, recipe: [{ itemSlug: "cookie-american-choc-chip", qty: 2 }, { itemSlug: "midnight-choc-cake-slice", qty: 1 }] });
    const en = (await loadCatalogue("en")).find((b) => b.id === "brownie-box");
    const ja = (await loadCatalogue("ja")).find((b) => b.id === "brownie-box");
    expect(en).toMatchObject({ name: "Brownie Box", desc: "Fudgy.", contents: "4 brownies", price: 1200, allergens: ["Egg", "Milk", "Wheat"] });
    expect(ja).toMatchObject({ name: "ブラウニーボックス", contents: "ブラウニー 4個" });
  });

  it("replaces the recipe on save, keeps the slug, and hides an inactive box from the menu only", async () => {
    const r = await saveBoxAction(newBox({ slug: "renamed", nameEn: "4 Cookie Box", price: "1100", active: false, recipe: [{ itemSlug: "cookie-matcha-white-choc", qty: "4" }] }), "cookie-box");
    expect(r).toMatchObject({ ok: true, slug: "cookie-box" });
    const box = await boxBySlug("cookie-box");
    expect(box).toMatchObject({ price: 1100, active: false, recipe: [{ itemSlug: "cookie-matcha-white-choc", qty: 4 }] });
    expect(await boxBySlug("renamed")).toBeNull();
    expect((await loadCatalogue("en")).map((b) => b.id)).not.toContain("cookie-box");
    // A drop that carries it keeps selling it, at the drop's own price.
    const drop = (await loadDrops("en")).find((d) => d.id === "drop-04")!;
    expect(drop.boxes.find((b) => b.id === "cookie-box")?.price).toBe(1000);
  });

  it("refuses a taken box slug and a recipe item that no longer exists, saving nothing", async () => {
    expect(await saveBoxAction(newBox({ slug: "cookie-box" }), null)).toEqual({ ok: false, errors: { slug: "Another box already has this slug." } });
    const gone = await saveBoxAction(newBox({ recipe: [{ itemSlug: "cookie-american-choc-chip", qty: "1" }, { itemSlug: "no-such-item", qty: "1" }] }), null);
    expect(gone).toEqual({ ok: false, errors: { "recipe.1.item": "That item doesn't exist any more." } });
    expect(await db.select().from(schema.boxes).where(eq(schema.boxes.slug, "brownie-box"))).toHaveLength(0);
  });

  it("refuses the slug 'new' for items and boxes, which would collide with the admin's /new pages", async () => {
    const item = await saveItemAction({ slug: "new", nameEn: "New", nameJa: "新作", productionUnit: "cookie", unitsPerProductionUnit: "1" }, null);
    expect(item.ok === false && item.errors.slug).toMatch(/taken by the admin's own pages/);
    const box = await saveBoxAction(newBox({ slug: "new" }), null);
    expect(box.ok === false && box.errors.slug).toMatch(/taken by the admin's own pages/);
    expect(await itemBySlug("new")).toBeNull();
    expect(await boxBySlug("new")).toBeNull();
  });

  it("saves a box slugged like an Object.prototype name, which the cart now handles", async () => {
    expect(await saveBoxAction(newBox({ slug: "constructor" }), null)).toMatchObject({ ok: true, slug: "constructor" });
  });

  it("validates before touching the database", async () => {
    const r = await saveBoxAction(newBox({ price: "10", recipe: [] }), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["price", "recipe"]);
    expect(await boxBySlug("brownie-box")).toBeNull();
  });
});
