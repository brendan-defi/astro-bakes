import "server-only";
import { asc, count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { boxes, boxItems, dropBoxes, items } from "@/db/schema";
import type { BoxValue, Errors, ItemValue, RecipeLine } from "./catalogue-rules";

/**
 * The box and item editors' reads and writes (PRD 4.3). Values arrive
 * already validated (catalogue-rules.ts); what's checked here needs the
 * database: slugs that are taken, recipe items that exist.
 */

type Saved = { ok: true; slug: string } | { ok: false; errors: Errors };

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";

// ---------------------------------------------------------------- items

export interface ItemSummary {
  slug: string;
  nameEn: string;
  nameJa: string | null;
  productionUnit: string;
  unitsPerProductionUnit: number;
  /** How many boxes use it. */
  boxes: number;
}

export async function listItems(): Promise<ItemSummary[]> {
  const db = getDb();
  const [rows, used] = await Promise.all([
    db.select().from(items).orderBy(asc(items.nameEn)),
    db.select({ itemId: boxItems.itemId, n: count() }).from(boxItems).groupBy(boxItems.itemId),
  ]);
  const uses = new Map(used.map((u) => [u.itemId, u.n]));
  return rows.map((r) => ({ slug: r.slug, nameEn: r.nameEn, nameJa: r.nameJa, productionUnit: r.productionUnit, unitsPerProductionUnit: r.unitsPerProductionUnit, boxes: uses.get(r.id) ?? 0 }));
}

export async function itemBySlug(slug: string): Promise<Omit<ItemValue, "slug"> & { slug: string } | null> {
  const r = await getDb().query.items.findFirst({ where: eq(items.slug, slug) });
  return r ? { slug: r.slug, nameEn: r.nameEn, nameJa: r.nameJa ?? "", productionUnit: r.productionUnit, unitsPerProductionUnit: r.unitsPerProductionUnit } : null;
}

/** Create (no `slug`) or update the item with that slug; a slug never changes once created. */
export async function saveItem(value: ItemValue, slug: string | null): Promise<Saved> {
  const db = getDb();
  const fields = { nameEn: value.nameEn, nameJa: value.nameJa, productionUnit: value.productionUnit, unitsPerProductionUnit: value.unitsPerProductionUnit };
  if (slug === null) {
    try {
      await db.insert(items).values({ slug: value.slug, ...fields });
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false, errors: { slug: "Another item already has this slug." } };
      throw e;
    }
    return { ok: true, slug: value.slug };
  }
  const updated = await db.update(items).set({ ...fields, updatedAt: new Date() }).where(eq(items.slug, slug)).returning({ slug: items.slug });
  return updated.length ? { ok: true, slug } : { ok: false, errors: { form: "That item no longer exists." } };
}

/** Every item, for the recipe picker. */
export async function itemOptions(): Promise<{ slug: string; name: string }[]> {
  const rows = await getDb().select({ slug: items.slug, nameEn: items.nameEn }).from(items).orderBy(asc(items.nameEn));
  return rows.map((r) => ({ slug: r.slug, name: r.nameEn }));
}

// ---------------------------------------------------------------- boxes

export interface BoxSummary {
  slug: string;
  nameEn: string;
  nameJa: string | null;
  price: number;
  active: boolean;
  defaultCap: number;
  defaultMaxPerCustomer: number;
  allergens: string[];
  /** "2 × Chocolate chip cookie, 1 × …" */
  recipe: string;
  /** How many drops carry it. */
  drops: number;
  hasPhoto: boolean;
}

export async function listBoxes(): Promise<BoxSummary[]> {
  const db = getDb();
  const [rows, inDrops] = await Promise.all([
    db.query.boxes.findMany({ orderBy: [asc(boxes.sort), asc(boxes.nameEn)], with: { boxItems: { with: { item: { columns: { nameEn: true } } } } } }),
    db.select({ boxId: dropBoxes.boxId, n: count() }).from(dropBoxes).groupBy(dropBoxes.boxId),
  ]);
  const drops = new Map(inDrops.map((d) => [d.boxId, d.n]));
  return rows.map((b) => ({
    slug: b.slug,
    nameEn: b.nameEn,
    nameJa: b.nameJa,
    price: b.price,
    active: b.active,
    defaultCap: b.defaultCap,
    defaultMaxPerCustomer: b.defaultMaxPerCustomer,
    allergens: b.allergens,
    recipe: b.boxItems.map((bi) => `${bi.qty} × ${bi.item.nameEn}`).join(", "),
    drops: drops.get(b.id) ?? 0,
    hasPhoto: b.photos.length > 0,
  }));
}

export type BoxForm = Omit<BoxValue, "slug"> & { slug: string };

export async function boxBySlug(slug: string): Promise<BoxForm | null> {
  const b = await getDb().query.boxes.findFirst({ where: eq(boxes.slug, slug), with: { boxItems: { with: { item: { columns: { slug: true, nameEn: true } } } } } });
  if (!b) return null;
  return {
    slug: b.slug,
    nameEn: b.nameEn,
    nameJa: b.nameJa ?? "",
    descriptionEn: b.descriptionEn ?? "",
    descriptionJa: b.descriptionJa ?? "",
    contentsEn: b.contentsEn ?? "",
    contentsJa: b.contentsJa ?? "",
    price: b.price,
    allergens: b.allergens,
    active: b.active,
    defaultCap: b.defaultCap,
    defaultMaxPerCustomer: b.defaultMaxPerCustomer,
    sort: b.sort,
    recipe: [...b.boxItems].sort((x, y) => x.item.nameEn.localeCompare(y.item.nameEn)).map((bi) => ({ itemSlug: bi.item.slug, qty: bi.qty })),
  };
}

/**
 * Create (no `slug`) or update the box with that slug, and replace its recipe, in one transaction. Prices and caps here
 * are defaults: a drop copies them when it's set up and keeps its own, so editing a box never reprices a drop.
 */
export async function saveBox(value: BoxValue, slug: string | null): Promise<Saved> {
  const db = getDb();
  const itemRows = await db.select({ id: items.id, slug: items.slug }).from(items).where(inArray(items.slug, value.recipe.map((l) => l.itemSlug)));
  const ids = new Map(itemRows.map((r) => [r.slug, r.id]));
  const missing = value.recipe.findIndex((l) => !ids.has(l.itemSlug));
  if (missing >= 0) return { ok: false, errors: { [`recipe.${missing}.item`]: "That item doesn't exist any more." } };

  const fields = {
    nameEn: value.nameEn,
    nameJa: value.nameJa,
    descriptionEn: value.descriptionEn || null,
    descriptionJa: value.descriptionJa || null,
    contentsEn: value.contentsEn || null,
    contentsJa: value.contentsJa || null,
    price: value.price,
    allergens: value.allergens,
    active: value.active,
    defaultCap: value.defaultCap,
    defaultMaxPerCustomer: value.defaultMaxPerCustomer,
    sort: value.sort,
  };
  try {
    return await db.transaction(async (tx) => {
      let boxId: string;
      if (slug === null) {
        const [row] = await tx.insert(boxes).values({ slug: value.slug, ...fields }).returning({ id: boxes.id });
        boxId = row.id;
      } else {
        const [row] = await tx.update(boxes).set({ ...fields, updatedAt: new Date() }).where(eq(boxes.slug, slug)).returning({ id: boxes.id });
        if (!row) return { ok: false as const, errors: { form: "That box no longer exists." } };
        boxId = row.id;
        await tx.delete(boxItems).where(eq(boxItems.boxId, boxId));
      }
      await tx.insert(boxItems).values(value.recipe.map((l: RecipeLine) => ({ boxId, itemId: ids.get(l.itemSlug)!, qty: l.qty })));
      return { ok: true as const, slug: slug ?? value.slug };
    });
  } catch (e) {
    if (slug === null && isUniqueViolation(e)) return { ok: false, errors: { slug: "Another box already has this slug." } };
    throw e;
  }
}
