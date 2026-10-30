import { ALLERGENS, allergenNamed } from "./allergens";

/**
 * Validating the box and item editors (PRD 4.3). Client-safe: the forms use
 * the same limits the server enforces.
 *
 * Slugs are set once, when the box or item is created. Carts, reservations,
 * links and the seed all refer to boxes by slug, so changing one later would
 * quietly orphan them.
 */

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 40;
/** Path segments the admin routes use beside /[slug] (/admin/boxes/new): a record slugged like one could never be opened. */
export const RESERVED_SLUGS = new Set(["new"]);

/** A slug suggestion from an English name: "4 Cookie Box" → "4-cookie-box". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

export type Errors = Record<string, string>;
export type Validation<T> = { ok: true; value: T } | { ok: false; errors: Errors };

type Raw = Record<string, unknown>;

function text(errors: Errors, raw: Raw, key: string, { max, required = false }: { max: number; required?: boolean }): string {
  const v = typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
  if (!v && required) errors[key] = "Required.";
  else if (v.length > max) errors[key] = `At most ${max} characters (this is ${v.length}).`;
  return v;
}

function int(errors: Errors, raw: Raw, key: string, min: number, max: number): number {
  const r = raw[key];
  const n = typeof r === "number" ? r : typeof r === "string" && r.trim() !== "" ? Number(r.normalize("NFKC").trim().replace(/,/g, "")) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) errors[key] = `A whole number from ${min} to ${max.toLocaleString("en-US")}.`;
  return n;
}

function slug(errors: Errors, raw: Raw, creating: boolean): string {
  if (!creating) return "";
  const v = typeof raw.slug === "string" ? raw.slug.trim() : "";
  if (!v) errors.slug = "Required.";
  else if (v.length > SLUG_MAX || !SLUG.test(v)) errors.slug = `Lower-case letters, digits and single hyphens, at most ${SLUG_MAX} characters.`;
  else if (RESERVED_SLUGS.has(v)) errors.slug = `“${v}” is taken by the admin's own pages; choose another.`;
  return v;
}

// ---------------------------------------------------------------- items

export interface ItemValue {
  /** Only when creating; empty on an edit. */
  slug: string;
  nameEn: string;
  nameJa: string;
  productionUnit: string;
  unitsPerProductionUnit: number;
  /** Spare production units the production sheet adds when the item is needed (PRD 4.5). */
  bakeBuffer: number;
}

/** The most spare units an item can ask for: more than this is a typo, not a buffer. */
export const BAKE_BUFFER_MAX = 20;

export function validateItem(raw: Raw, { creating }: { creating: boolean }): Validation<ItemValue> {
  const errors: Errors = {};
  const value: ItemValue = {
    slug: slug(errors, raw, creating),
    nameEn: text(errors, raw, "nameEn", { max: 80, required: true }),
    nameJa: text(errors, raw, "nameJa", { max: 80, required: true }),
    productionUnit: text(errors, raw, "productionUnit", { max: 30, required: true }),
    unitsPerProductionUnit: int(errors, raw, "unitsPerProductionUnit", 1, 100),
    // Left out (an older form, a script), it's no spare rather than an error.
    bakeBuffer: raw.bakeBuffer === undefined || raw.bakeBuffer === "" ? 0 : int(errors, raw, "bakeBuffer", 0, BAKE_BUFFER_MAX),
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

// ---------------------------------------------------------------- boxes

export interface RecipeLine {
  itemSlug: string;
  qty: number;
}

export interface BoxValue {
  /** Only when creating; empty on an edit. */
  slug: string;
  nameEn: string;
  nameJa: string;
  descriptionEn: string;
  descriptionJa: string;
  contentsEn: string;
  contentsJa: string;
  /** Tax-inclusive yen (D18). */
  price: number;
  /** Listed allergen names, in the list's order. */
  allergens: string[];
  active: boolean;
  defaultCap: number;
  defaultMaxPerCustomer: number;
  sort: number;
  recipe: RecipeLine[];
}

/** ¥50 is the least Stripe (and PayPay) will charge. */
export const MIN_PRICE = 50;
export const MAX_RECIPE_LINES = 20;

export function validateBox(raw: Raw, { creating }: { creating: boolean }): Validation<BoxValue> {
  const errors: Errors = {};
  const allergensIn = Array.isArray(raw.allergens) ? raw.allergens : [];
  const unknown = allergensIn.filter((a) => typeof a !== "string" || !allergenNamed(a));
  if (!Array.isArray(raw.allergens) || unknown.length) errors.allergens = "Choose from the listed allergens.";
  const chosen = new Set(allergensIn.map((a) => (typeof a === "string" ? allergenNamed(a)?.name : undefined)));

  const recipeIn = Array.isArray(raw.recipe) ? (raw.recipe as unknown[]) : null;
  const recipe: RecipeLine[] = [];
  if (!recipeIn || recipeIn.length === 0) errors.recipe = "Add at least one item: the production sheet counts what to bake from this.";
  else if (recipeIn.length > MAX_RECIPE_LINES) errors.recipe = `At most ${MAX_RECIPE_LINES} items.`;
  else {
    const seen = new Set<string>();
    recipeIn.forEach((line, i) => {
      const l = (line ?? {}) as Raw;
      const itemSlug = typeof l.itemSlug === "string" ? l.itemSlug.trim() : "";
      // Errors name the field that failed (recipe.N.item, recipe.N.qty), so the form can mark and focus that input.
      const lineErrors: Errors = {};
      const qty = int(lineErrors, l, "qty", 1, 99);
      if (!itemSlug) errors[`recipe.${i}.item`] = "Choose an item.";
      else if (seen.has(itemSlug)) errors[`recipe.${i}.item`] = "This item is already in the box; change the quantity instead.";
      if (lineErrors.qty) errors[`recipe.${i}.qty`] = lineErrors.qty;
      seen.add(itemSlug);
      recipe.push({ itemSlug, qty });
    });
  }

  const value: BoxValue = {
    slug: slug(errors, raw, creating),
    nameEn: text(errors, raw, "nameEn", { max: 80, required: true }),
    nameJa: text(errors, raw, "nameJa", { max: 80, required: true }),
    descriptionEn: text(errors, raw, "descriptionEn", { max: 300 }),
    descriptionJa: text(errors, raw, "descriptionJa", { max: 300 }),
    contentsEn: text(errors, raw, "contentsEn", { max: 300 }),
    contentsJa: text(errors, raw, "contentsJa", { max: 300 }),
    price: int(errors, raw, "price", MIN_PRICE, 100_000),
    allergens: ALLERGENS.filter((a) => chosen.has(a.name)).map((a) => a.name),
    active: raw.active === true,
    defaultCap: int(errors, raw, "defaultCap", 0, 1000),
    defaultMaxPerCustomer: int(errors, raw, "defaultMaxPerCustomer", 1, 20),
    sort: int(errors, raw, "sort", 0, 999),
    recipe,
  };
  if (typeof raw.active !== "boolean") errors.active = "Choose on or off.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
