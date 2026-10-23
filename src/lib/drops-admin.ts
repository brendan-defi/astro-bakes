import "server-only";
import { and, asc, count, desc, eq, gt, inArray, max, sql, sum } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { boxes, dropBoxes, drops, inventoryHolds, orderItems, orders } from "@/db/schema";
import { arrivalDate, effectiveState, type DropState } from "./data";
import { dropSlug, editable, nextMonth, type DropContext, type DropValue, type Errors } from "./drop-rules";
import { arrivalOffsetDays } from "./settings";

/**
 * The drop editor's reads and writes (PRD 4.2). Values arrive validated
 * (drop-rules.ts); the save re-checks what can change under it inside one
 * transaction: the drop's state, and stock that checkouts are holding.
 *
 * Lock order matches the checkout (cart → drop → drop_boxes; checkout.ts),
 * so a save and a checkout can't deadlock.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Orders that count as sold: paid and onwards, not pending, expired or cancelled. */
const SOLD_STATES = ["paid", "packed", "shipped", "complete"] as const;

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";

/** Thrown inside the save transaction to roll it back with field errors. */
class Refused extends Error {
  constructor(readonly errors: Errors) {
    super("refused");
  }
}

async function liveState(d: { state: DropState; openAt: Date; closeAt: Date; shipAt: Date }, offset?: number, now = new Date()): Promise<DropState> {
  return effectiveState({ ...d, arriveAt: arrivalDate(d.shipAt, offset ?? (await arrivalOffsetDays())) }, now);
}

// ---------------------------------------------------------------- reads

export interface DropSummary {
  slug: string;
  number: number;
  nameEn: string;
  state: DropState;
  openAt: Date;
  closeAt: Date;
  shipAt: Date;
  sold: number;
  cap: number;
  orders: number;
  /** Tax-inclusive yen from paid (and later) orders. */
  revenue: number;
}

export async function listDropsAdmin(): Promise<DropSummary[]> {
  const db = getDb();
  const [rows, money, offset] = await Promise.all([
    db.query.drops.findMany({ orderBy: [desc(drops.number)], with: { dropBoxes: { columns: { cap: true, soldQty: true } } } }),
    db
      .select({ dropId: orders.dropId, n: count(), revenue: sum(orders.total) })
      .from(orders)
      .where(inArray(orders.state, [...SOLD_STATES]))
      .groupBy(orders.dropId),
    arrivalOffsetDays(),
  ]);
  const byDrop = new Map(money.map((m) => [m.dropId, m]));
  const now = new Date();
  return Promise.all(
    rows.map(async (d) => ({
      slug: d.slug,
      number: d.number,
      nameEn: d.nameEn,
      state: await liveState(d, offset, now),
      openAt: d.openAt,
      closeAt: d.closeAt,
      shipAt: d.shipAt,
      sold: d.dropBoxes.reduce((n, b) => n + b.soldQty, 0),
      cap: d.dropBoxes.reduce((n, b) => n + b.cap, 0),
      orders: byDrop.get(d.id)?.n ?? 0,
      revenue: Number(byDrop.get(d.id)?.revenue ?? 0),
    })),
  );
}

export interface DropForm {
  slug: string;
  number: number;
  state: DropState;
  nameEn: string;
  nameJa: string;
  descriptionEn: string;
  descriptionJa: string;
  openAt: Date;
  closeAt: Date;
  bakeAt: Date | null;
  shipAt: Date;
  boxes: { boxSlug: string; name: string; cap: number; price: number; maxPerCustomer: number; sold: number; held: number }[];
}

/** Live holds per drop box: stock reserved by checkouts that haven't finished or lapsed. */
async function heldByDropBox(conn: Db | Tx, dropBoxIds: string[]): Promise<Map<string, number>> {
  if (!dropBoxIds.length) return new Map();
  const rows = await conn
    .select({ id: inventoryHolds.dropBoxId, qty: sum(inventoryHolds.qty) })
    .from(inventoryHolds)
    .where(and(inArray(inventoryHolds.dropBoxId, dropBoxIds), gt(inventoryHolds.expiresAt, new Date())))
    .groupBy(inventoryHolds.dropBoxId);
  return new Map(rows.map((r) => [r.id, Number(r.qty ?? 0)]));
}

export async function dropForForm(slug: string): Promise<DropForm | null> {
  const db = getDb();
  const d = await db.query.drops.findFirst({ where: eq(drops.slug, slug), with: { dropBoxes: { orderBy: [asc(dropBoxes.sort)], with: { box: { columns: { slug: true, nameEn: true } } } } } });
  if (!d) return null;
  const held = await heldByDropBox(db, d.dropBoxes.map((b) => b.id));
  return {
    slug: d.slug,
    number: d.number,
    state: await liveState(d),
    nameEn: d.nameEn,
    nameJa: d.nameJa ?? "",
    descriptionEn: d.descriptionEn ?? "",
    descriptionJa: d.descriptionJa ?? "",
    openAt: d.openAt,
    closeAt: d.closeAt,
    bakeAt: d.bakeAt,
    shipAt: d.shipAt,
    boxes: d.dropBoxes.map((b) => ({ boxSlug: b.box.slug, name: b.box.nameEn, cap: b.cap, price: b.price, maxPerCustomer: b.maxPerCustomer, sold: b.soldQty, held: held.get(b.id) ?? 0 })),
  };
}

/** What validateDrop needs to know about the drop being edited (or a fresh one). */
export async function dropContext(slug: string | null): Promise<DropContext | null> {
  const now = new Date();
  if (slug === null) return { creating: true, state: "draft", now, taken: {} };
  const form = await dropForForm(slug);
  if (!form) return null;
  return { creating: false, state: form.state, now, taken: Object.fromEntries(form.boxes.map((b) => [b.boxSlug, { sold: b.sold, held: b.held }])) };
}

/** Every box, for the drop's box picker, with the defaults a new row starts from. */
export async function boxChoices(): Promise<{ slug: string; name: string; price: number; defaultCap: number; defaultMaxPerCustomer: number; active: boolean }[]> {
  const rows = await getDb().select().from(boxes).orderBy(asc(boxes.sort), asc(boxes.nameEn));
  return rows.map((b) => ({ slug: b.slug, name: b.nameEn, price: b.price, defaultCap: b.defaultCap, defaultMaxPerCustomer: b.defaultMaxPerCustomer, active: b.active }));
}

export async function nextDropNumber(): Promise<number> {
  const [row] = await getDb().select({ n: max(drops.number) }).from(drops);
  return (row?.n ?? 0) + 1;
}

// ---------------------------------------------------------------- writes

type Saved = { ok: true; slug: string } | { ok: false; errors: Errors };

async function boxIds(tx: Tx, slugs: string[]) {
  const rows = slugs.length ? await tx.select({ id: boxes.id, slug: boxes.slug }).from(boxes).where(inArray(boxes.slug, slugs)) : [];
  return new Map(rows.map((r) => [r.slug, r.id]));
}

/** Create a draft drop (no `slug`), or save the one with that slug, applying only what its state lets change. */
export async function saveDrop(value: DropValue, slug: string | null): Promise<Saved> {
  try {
    return await getDb().transaction(async (tx) => (slug === null ? create(tx, value) : update(tx, value, slug)));
  } catch (e) {
    if (e instanceof Refused) return { ok: false, errors: e.errors };
    if (slug === null && isUniqueViolation(e)) return { ok: false, errors: { number: "Another drop already has this number." } };
    throw e;
  }
}

async function create(tx: Tx, v: DropValue): Promise<Saved> {
  const ids = await boxIds(tx, v.boxes.map((b) => b.boxSlug));
  const missing = v.boxes.findIndex((b) => !ids.has(b.boxSlug));
  if (missing >= 0) throw new Refused({ [`boxes.${missing}.box`]: "That box doesn't exist any more." });
  const slug = dropSlug(v.number);
  const [d] = await tx
    .insert(drops)
    .values({ number: v.number, slug, nameEn: v.nameEn, nameJa: v.nameJa, descriptionEn: v.descriptionEn || null, descriptionJa: v.descriptionJa || null, state: "draft", openAt: v.openAt, closeAt: v.closeAt, bakeAt: v.bakeAt, shipAt: v.shipAt })
    .returning({ id: drops.id });
  await tx.insert(dropBoxes).values(v.boxes.map((b, i) => ({ dropId: d.id, boxId: ids.get(b.boxSlug)!, cap: b.cap, price: b.price, maxPerCustomer: b.maxPerCustomer, sort: i })));
  return { ok: true, slug };
}

async function update(tx: Tx, v: DropValue, slug: string): Promise<Saved> {
  const [d] = await tx.select().from(drops).where(eq(drops.slug, slug)).for("update");
  if (!d) throw new Refused({ form: "That drop no longer exists." });
  const can = editable(await liveState(d));
  const current = await tx
    .select({ id: dropBoxes.id, boxSlug: boxes.slug, soldQty: dropBoxes.soldQty })
    .from(dropBoxes)
    .innerJoin(boxes, eq(boxes.id, dropBoxes.boxId))
    .where(eq(dropBoxes.dropId, d.id))
    .orderBy(asc(dropBoxes.id))
    .for("update", { of: dropBoxes });
  const held = await heldByDropBox(tx, current.map((c) => c.id));
  const bySlug = new Map(current.map((c) => [c.boxSlug, c]));
  const errors: Errors = {};

  await tx
    .update(drops)
    .set({
      nameEn: v.nameEn,
      nameJa: v.nameJa,
      descriptionEn: v.descriptionEn || null,
      descriptionJa: v.descriptionJa || null,
      ...(can.dates ? { openAt: v.openAt, closeAt: v.closeAt, bakeAt: v.bakeAt, shipAt: v.shipAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(drops.id, d.id));

  // Boxes leaving the drop: only before it opens, and never one with orders (order_items restricts the delete too).
  const wanted = new Set(v.boxes.map((b) => b.boxSlug));
  const leaving = current.filter((c) => !wanted.has(c.boxSlug));
  if (leaving.length && !can.boxes) errors.boxes = "Boxes can't be added or removed once the drop has opened.";
  if (leaving.length && can.boxes) {
    const [withOrders] = await tx.select({ n: count() }).from(orderItems).where(inArray(orderItems.dropBoxId, leaving.map((c) => c.id)));
    if (leaving.some((c) => c.soldQty > 0) || withOrders.n > 0) errors.boxes = "A box that has orders can't be removed.";
    else await tx.delete(dropBoxes).where(inArray(dropBoxes.id, leaving.map((c) => c.id)));
  }

  const ids = await boxIds(tx, v.boxes.filter((b) => !bySlug.has(b.boxSlug)).map((b) => b.boxSlug));
  for (const [i, b] of v.boxes.entries()) {
    const existing = bySlug.get(b.boxSlug);
    if (!existing) {
      if (!can.boxes) errors.boxes = "Boxes can't be added or removed once the drop has opened.";
      else if (!ids.has(b.boxSlug)) errors[`boxes.${i}.box`] = "That box doesn't exist any more.";
      else await tx.insert(dropBoxes).values({ dropId: d.id, boxId: ids.get(b.boxSlug)!, cap: b.cap, price: b.price, maxPerCustomer: b.maxPerCustomer, sort: i });
      continue;
    }
    const taken = existing.soldQty + (held.get(existing.id) ?? 0);
    if (can.caps && b.cap < taken) errors[`boxes.${i}.cap`] = `At least ${taken}: ${existing.soldQty} sold${taken > existing.soldQty ? `, ${taken - existing.soldQty} in checkouts right now` : ""}.`;
    await tx
      .update(dropBoxes)
      .set({ ...(can.caps ? { cap: b.cap, maxPerCustomer: b.maxPerCustomer } : {}), ...(can.prices ? { price: b.price } : {}), ...(can.boxes ? { sort: i } : {}) })
      .where(eq(dropBoxes.id, existing.id));
  }
  if (Object.keys(errors).length) throw new Refused(errors);
  return { ok: true, slug };
}

/**
 * A new draft from an existing drop (PRD 4.2 "Duplicate"): its names, boxes, caps, prices and limits, the next
 * number, and every date a month later, since the dates can't be empty. Nothing sold carries over.
 */
export async function duplicateDrop(slug: string): Promise<{ ok: true; slug: string } | { ok: false; error: "not_found" }> {
  return getDb().transaction(async (tx) => {
    const d = await tx.query.drops.findFirst({ where: eq(drops.slug, slug), with: { dropBoxes: { orderBy: [asc(dropBoxes.sort)] } } });
    if (!d) return { ok: false as const, error: "not_found" as const };
    // Serialise numbering: two duplicates at once must not both take the same next number.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('drop-number'))`);
    const [row] = await tx.select({ n: max(drops.number) }).from(drops);
    const number = (row?.n ?? 0) + 1;
    const [copy] = await tx
      .insert(drops)
      .values({
        number,
        slug: dropSlug(number),
        nameEn: `${d.nameEn} (copy)`,
        nameJa: d.nameJa ? `${d.nameJa}（コピー）` : null,
        descriptionEn: d.descriptionEn,
        descriptionJa: d.descriptionJa,
        state: "draft",
        openAt: nextMonth(d.openAt),
        closeAt: nextMonth(d.closeAt),
        bakeAt: d.bakeAt ? nextMonth(d.bakeAt) : null,
        shipAt: nextMonth(d.shipAt),
      })
      .returning({ id: drops.id, slug: drops.slug });
    if (d.dropBoxes.length) {
      await tx.insert(dropBoxes).values(d.dropBoxes.map((b) => ({ dropId: copy.id, boxId: b.boxId, cap: b.cap, price: b.price, maxPerCustomer: b.maxPerCustomer, sort: b.sort })));
    }
    return { ok: true as const, slug: copy.slug };
  });
}
