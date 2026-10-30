import type { DropState } from "./data";
import { fmtDateTime } from "./format";
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

/** Checkouts on the drop that hold boxes and can still be paid (PRD 3.8: a hold may finish after the drop closes). */
export interface OpenCheckouts {
  checkouts: number;
  boxes: number;
  /** When the last of their holds runs out; null with none. */
  until: Date | null;
}

const counted = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Whether the drop's paid orders are all there is, in a line above the numbers. While it's open they grow with each
 * order. Once it has closed they're final only when no checkout begun before the close can still be paid: those
 * finish while their hold lasts, so until then the sheet says how many and until when, and doesn't count them.
 */
export function sheetStanding(d: { state: DropState; closeAt: Date }, open: OpenCheckouts): { final: boolean; text: string } {
  const held = open.checkouts ? `${counted(open.checkouts, "checkout")} ${open.checkouts === 1 ? "holds" : "hold"} ${counted(open.boxes, "more box", "more boxes")}` : "";
  switch (d.state) {
    case "draft":
    case "scheduled":
      return { final: false, text: "The drop hasn't opened, so there's nothing to bake yet." };
    case "open":
      return { final: false, text: `A projection: the drop is open until ${fmtDateTime(d.closeAt)}, so these numbers grow with each order.${held ? ` Right now ${held}, not counted until paid.` : ""}` };
    case "cancelled":
      return { final: false, text: "The drop is cancelled; there's nothing to bake." };
    default:
      if (open.checkouts && open.until) {
        return { final: false, text: `Not final yet: the drop closed ${fmtDateTime(d.closeAt)}, but ${held} that can still be paid until ${fmtDateTime(open.until)}. Only paid orders are counted; refresh after that for the final numbers.` };
      }
      return { final: true, text: `Final: the drop closed ${fmtDateTime(d.closeAt)}.` };
  }
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
