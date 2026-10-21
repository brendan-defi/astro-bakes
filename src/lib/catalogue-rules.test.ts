import { describe, expect, it } from "vitest";
import { ALLERGENS, allergenNamed, RECOMMENDED_ALLERGENS, REQUIRED_ALLERGENS } from "./allergens";
import { slugify, validateBox, validateItem } from "./catalogue-rules";
import { getStrings } from "./i18n";

const box = (over: Record<string, unknown> = {}) => ({
  slug: "cookie-box", nameEn: "4 Cookie Box", nameJa: "4種のクッキーボックス", descriptionEn: "", descriptionJa: "", contentsEn: "", contentsJa: "",
  price: "1000", allergens: ["Egg", "Milk", "Wheat"], active: true, defaultCap: "20", defaultMaxPerCustomer: "5", sort: "0",
  recipe: [{ itemSlug: "cookie-choc-chip", qty: "4" }], ...over,
});
const item = (over: Record<string, unknown> = {}) => ({ slug: "cake-slice", nameEn: "Cake, slice", nameJa: "ケーキ（スライス）", productionUnit: "cake", unitsPerProductionUnit: "12", ...over });
const errors = (r: { ok: boolean; errors?: Record<string, string> }) => (r.ok ? {} : r.errors!);

describe("allergens", () => {
  it("lists the 9 required (cashew since the agency's 2026-04-01 notice) and 19 recommended, each labelled in Japanese on the shop", () => {
    expect(REQUIRED_ALLERGENS.map((a) => a.name)).toEqual(["Egg", "Milk", "Wheat", "Buckwheat", "Peanut", "Shrimp", "Crab", "Walnut", "Cashew"]);
    expect(RECOMMENDED_ALLERGENS).toHaveLength(19);
    expect(RECOMMENDED_ALLERGENS.map((a) => a.name)).not.toContain("Cashew");
    const ja = getStrings("ja");
    for (const a of ALLERGENS) expect(ja.allergen(a.name)).toBe(a.ja);
    expect(new Set(ALLERGENS.map((a) => a.name.toLowerCase())).size).toBe(28);
  });

  it("knows every allergen the seeded boxes use, matched loosely", () => {
    for (const name of ["Egg", "Milk", "Wheat", "Walnut"]) expect(allergenNamed(name)?.name).toBe(name);
    expect(allergenNamed(" egg ")?.name).toBe("Egg");
    expect(allergenNamed("Gluten")).toBeUndefined();
  });
});

describe("slugify", () => {
  it("suggests a slug from an English name", () => {
    expect(slugify("4 Cookie Box")).toBe("4-cookie-box");
    expect(slugify("Cookies & Cream — Café Edition!")).toBe("cookies-and-cream-cafe-edition");
    expect(slugify("  ネビュラ  ")).toBe("");
    expect(slugify("x".repeat(60))).toHaveLength(40);
  });
});

describe("validateItem", () => {
  it("accepts a complete item, trimmed and with full-width digits", () => {
    expect(validateItem(item({ nameEn: "  Cake, slice ", unitsPerProductionUnit: "１２" }), { creating: true })).toEqual({ ok: true, value: { slug: "cake-slice", nameEn: "Cake, slice", nameJa: "ケーキ（スライス）", productionUnit: "cake", unitsPerProductionUnit: 12 } });
  });

  it("requires both names, a unit and a whole count; a slug only when creating", () => {
    expect(Object.keys(errors(validateItem(item({ nameJa: "", productionUnit: " ", unitsPerProductionUnit: "0" }), { creating: true }))).sort()).toEqual(["nameJa", "productionUnit", "unitsPerProductionUnit"]);
    expect(errors(validateItem(item({ slug: "Cake Slice" }), { creating: true })).slug).toMatch(/Lower-case/);
    // "new" is the admin's own /new page beside /[slug]: a record slugged "new" could never be opened.
    expect(errors(validateItem(item({ slug: "new" }), { creating: true })).slug).toMatch(/taken by the admin's own pages/);
    expect(errors(validateBox(box({ slug: "new" }), { creating: true })).slug).toMatch(/taken by the admin's own pages/);
    expect(slugify("New")).toBe("new");
    const edit = validateItem(item({ slug: "anything goes" }), { creating: false });
    expect(edit.ok && edit.value.slug).toBe("");
  });
});

describe("validateBox", () => {
  it("accepts a complete box and keeps allergens in the list's order", () => {
    const r = validateBox(box({ allergens: ["Wheat", "egg", "Almond"] }), { creating: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ price: 1000, defaultCap: 20, defaultMaxPerCustomer: 5, active: true, recipe: [{ itemSlug: "cookie-choc-chip", qty: 4 }] });
    expect(r.value.allergens).toEqual(["Egg", "Wheat", "Almond"]);
  });

  it("refuses unknown allergens, prices under ¥50, and out-of-range defaults", () => {
    const e = errors(validateBox(box({ allergens: ["Egg", "Gluten"], price: "49", defaultCap: "-1", defaultMaxPerCustomer: "0", sort: "1000" }), { creating: true }));
    expect(Object.keys(e).sort()).toEqual(["allergens", "defaultCap", "defaultMaxPerCustomer", "price", "sort"]);
    expect(e.price).toBe("A whole number from 50 to 100,000.");
  });

  it("needs a recipe of distinct items with sensible quantities, and says which line is wrong", () => {
    expect(errors(validateBox(box({ recipe: [] }), { creating: true })).recipe).toMatch(/at least one item/);
    const e = errors(validateBox(box({ recipe: [{ itemSlug: "a", qty: "1" }, { itemSlug: "", qty: "1" }, { itemSlug: "a", qty: "2" }, { itemSlug: "b", qty: "100" }, { itemSlug: "", qty: "0" }] }), { creating: true }));
    // Each error names the field that failed, so the form can mark that input.
    expect(e).toEqual({
      "recipe.1.item": "Choose an item.",
      "recipe.2.item": expect.stringMatching(/already in the box/),
      "recipe.3.qty": "A whole number from 1 to 99.",
      "recipe.4.item": "Choose an item.",
      "recipe.4.qty": "A whole number from 1 to 99.",
    });
  });

  it("requires names in both languages, and an on/off for active", () => {
    const e = errors(validateBox(box({ nameJa: "", active: "yes" }), { creating: true }));
    expect(e).toMatchObject({ nameJa: "Required.", active: "Choose on or off." });
  });
});
