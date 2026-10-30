import { describe, expect, it } from "vitest";
import { canPack, countOf, packRefusal, packStateRefusal, productionPlan, type PlanItem } from "./fulfilment-rules";

const item = (slug: string, productionUnit: string, unitsPerProductionUnit = 1, bakeBuffer = 0): PlanItem => ({ slug, nameEn: slug, nameJa: null, productionUnit, unitsPerProductionUnit, bakeBuffer });
const chip = item("choc-chip", "cookie");
const matcha = item("matcha", "cookie");
const slice = item("banana-slice", "mini loaf", 6, 1);
const loaf = item("banana-loaf", "mini loaf");
const cake = item("cake-slice", "cake", 12, 1);

describe("productionPlan (PRD 4.5)", () => {
  it("adds up each item over the boxes sold, rounds up to what the kitchen bakes, and adds the buffer", () => {
    const plan = productionPlan([
      { nameEn: "4 Cookie Box", sold: 11, recipe: [{ item: chip, qty: 1 }, { item: matcha, qty: 1 }] },
      { nameEn: "Banana Bread", sold: 2, recipe: [{ item: loaf, qty: 1 }] },
      { nameEn: "Sampler", sold: 7, recipe: [{ item: slice, qty: 1 }, { item: cake, qty: 1 }, { item: chip, qty: 2 }] },
    ]);
    // Grouped by what the kitchen counts in, then by name.
    expect(plan.items.map((r) => [r.item.slug, r.needed, r.base, r.buffer, r.toBake, r.spare])).toEqual([
      ["cake-slice", 7, 1, 1, 2, 17],
      ["choc-chip", 25, 25, 0, 25, 0],
      ["matcha", 11, 11, 0, 11, 0],
      ["banana-loaf", 2, 2, 0, 2, 0],
      ["banana-slice", 7, 2, 1, 3, 11],
    ]);
    expect(plan.boxes).toEqual([{ nameEn: "4 Cookie Box", count: 11 }, { nameEn: "Banana Bread", count: 2 }, { nameEn: "Sampler", count: 7 }]);
    expect(plan.totalBoxes).toBe(20);
    expect(plan.unplanned).toEqual([]);
  });

  it("rounds up exactly at the boundary: 12 slices fill one cake, 13 need two", () => {
    const at = (sold: number) => productionPlan([{ nameEn: "Cake", sold, recipe: [{ item: { ...cake, bakeBuffer: 0 }, qty: 1 }] }]).items[0];
    expect(at(12)).toMatchObject({ base: 1, toBake: 1, spare: 0 });
    expect(at(13)).toMatchObject({ base: 2, toBake: 2, spare: 11 });
  });

  it("leaves out boxes nobody bought and items nothing needs, buffer and all", () => {
    const plan = productionPlan([
      { nameEn: "4 Cookie Box", sold: 3, recipe: [{ item: chip, qty: 1 }] },
      { nameEn: "Sampler", sold: 0, recipe: [{ item: slice, qty: 1 }, { item: cake, qty: 1 }] },
    ]);
    expect(plan.items.map((r) => r.item.slug)).toEqual(["choc-chip"]);
    expect(plan.boxes).toEqual([{ nameEn: "4 Cookie Box", count: 3 }]);
  });

  it("names a sold box with an empty recipe, since the sheet can't count it", () => {
    const plan = productionPlan([{ nameEn: "Mystery Box", sold: 2, recipe: [] }]);
    expect(plan).toMatchObject({ items: [], totalBoxes: 2, unplanned: ["Mystery Box"] });
  });

  it("is empty with no sales", () => {
    expect(productionPlan([])).toEqual({ items: [], boxes: [], totalBoxes: 0, unplanned: [] });
  });
});

describe("countOf", () => {
  it("counts English units the way the kitchen says them", () => {
    expect(countOf(1, "mini loaf")).toBe("1 mini loaf");
    expect(countOf(3, "mini loaf")).toBe("3 mini loaves");
    expect(countOf(4, "batch")).toBe("4 batches");
    expect(countOf(2, "cake")).toBe("2 cakes");
    expect(countOf(25, "cookie")).toBe("25 cookies");
    expect(countOf(2, "tray")).toBe("2 trays");
    expect(countOf(2, "pastry")).toBe("2 pastries");
    expect(countOf(0, "cake")).toBe("0 cakes");
  });
  it("leaves a unit it can't pluralise as typed", () => {
    expect(countOf(3, "本")).toBe("3 本");
    expect(countOf(3, "9-inch cake")).toBe("3 9-inch cake");
  });
});

describe("packing rules (PRD 4.6)", () => {
  it("packs only once the drop has closed, so packing never takes away a customer's cancel or slot change", () => {
    expect(["closed", "baking", "shipped", "complete"].every((s) => canPack(s as never))).toBe(true);
    expect(["draft", "scheduled", "open", "cancelled"].some((s) => canPack(s as never))).toBe(false);
    expect(packRefusal("open")).toMatch(/still open/);
    expect(packRefusal("scheduled")).toBe("The drop hasn't opened yet.");
    expect(packRefusal("cancelled")).toBe("The drop is cancelled.");
  });
  it("says why an order can't be ticked", () => {
    expect(packStateRefusal("cancelled")).toBe("It was cancelled.");
    expect(packStateRefusal("shipped")).toBe("It has shipped already.");
    expect(packStateRefusal("pending_payment")).toBe("It hasn't been paid.");
  });
});
