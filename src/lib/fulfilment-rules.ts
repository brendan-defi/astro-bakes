import type { DropState } from "./data";
import type { OrderState } from "./order-status";

/**
 * Rules for the kitchen and the packing table (PRD 4.5, 4.6). Client-safe: the
 * production sheet's arithmetic and the packing rules, with no database access.
 */

// ---------------------------------------------------------------- production sheet (PRD 4.5)

export interface PlanItem {
  slug: string;
  nameEn: string;
  nameJa: string | null;
  /** What the kitchen counts in: "cookie", "mini loaf", "cake". */
  productionUnit: string;
  /** Sold units per production unit: 12 slices per cake. */
  unitsPerProductionUnit: number;
  /** Spare production units on top of what's needed. */
  bakeBuffer: number;
}

/** A box on the drop: how many were sold, and what goes in one. */
export interface PlanBox {
  nameEn: string;
  sold: number;
  recipe: { item: PlanItem; qty: number }[];
}

export interface ProductionRow {
  item: PlanItem;
  /** Units the boxes take: slices, cookies, whole loaves. */
  needed: number;
  /** Production units that covers, rounded up. */
  base: number;
  /** The item's buffer, when any of it is needed. */
  buffer: number;
  toBake: number;
  /** Units left over once the boxes are filled. */
  spare: number;
}

export interface ProductionPlan {
  items: ProductionRow[];
  /** Boxes to assemble, by type, as the drop lists them. */
  boxes: { nameEn: string; count: number }[];
  totalBoxes: number;
  /** Boxes sold with nothing in their recipe, which the sheet can't count. */
  unplanned: string[];
}

/**
 * What to bake: for each item, needed = Σ boxes sold × the item's qty in that box; to bake = ⌈needed ÷ units per
 * production unit⌉ + the item's buffer. An item nothing needs is left off, buffer and all: there's no point baking a
 * spare cake for slices nobody ordered. Items are grouped by what the kitchen counts in, then by name.
 */
export function productionPlan(boxes: PlanBox[]): ProductionPlan {
  const needed = new Map<string, { item: PlanItem; n: number }>();
  for (const b of boxes) {
    if (b.sold <= 0) continue;
    for (const { item, qty } of b.recipe) {
      const cur = needed.get(item.slug) ?? { item, n: 0 };
      needed.set(item.slug, { item, n: cur.n + b.sold * qty });
    }
  }
  const items = [...needed.values()]
    .filter((x) => x.n > 0)
    .map(({ item, n }): ProductionRow => {
      const per = Math.max(1, item.unitsPerProductionUnit);
      const base = Math.ceil(n / per);
      const buffer = Math.max(0, item.bakeBuffer);
      return { item, needed: n, base, buffer, toBake: base + buffer, spare: (base + buffer) * per - n };
    })
    .sort((a, b) => a.item.productionUnit.localeCompare(b.item.productionUnit) || a.item.nameEn.localeCompare(b.item.nameEn));
  const sold = boxes.filter((b) => b.sold > 0);
  return {
    items,
    boxes: sold.map((b) => ({ nameEn: b.nameEn, count: b.sold })),
    totalBoxes: sold.reduce((n, b) => n + b.sold, 0),
    unplanned: sold.filter((b) => b.recipe.length === 0).map((b) => b.nameEn),
  };
}

/**
 * "3 mini loaves", "1 cake", "4 batches": an English unit counted. The owner types the units, so only plain English
 * words are made plural; anything else (a Japanese unit, a unit with digits) is left as typed.
 */
export function countOf(n: number, unit: string): string {
  return `${n} ${n === 1 || !/^[a-z][a-z -]*$/i.test(unit) ? unit : plural(unit)}`;
}

function plural(w: string): string {
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  if (/[^f]f$/i.test(w)) return `${w.slice(0, -1)}ves`;
  return `${w}s`;
}

// ---------------------------------------------------------------- packing (PRD 4.6)

/**
 * Orders are packed once the drop has closed. Before that a customer may still cancel or change their delivery
 * time, and both stop once an order is packed, so packing early would quietly take those away (D21, D22).
 */
export const canPack = (dropState: DropState) => dropState === "closed" || dropState === "baking" || dropState === "shipped" || dropState === "complete";

/** Why packing isn't available on a drop in this state, in the admin's words. */
export function packRefusal(dropState: DropState): string {
  if (dropState === "open") return "The drop is still open: customers can cancel or change their delivery time until it closes, so pack once it has closed.";
  if (dropState === "cancelled") return "The drop is cancelled.";
  return "The drop hasn't opened yet.";
}

/** Why an order in this state can't be ticked or unticked as packed. */
export function packStateRefusal(state: OrderState): string {
  if (state === "cancelled") return "It was cancelled.";
  if (state === "shipped" || state === "complete") return "It has shipped already.";
  return "It hasn't been paid.";
}
