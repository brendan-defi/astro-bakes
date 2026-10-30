import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, max, ne, sql, sum } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { boxes, dropBoxes, drops, inventoryHolds, orderItems, orders, refunds } from "@/db/schema";
import { arrivalDate, effectiveState, type DropState } from "./data";
import { dropSlug, editable, nextMonth, sameEditability, type DropContext, type DropValue, type Errors } from "./drop-rules";
import { clashMessage, transition, windowClash, type DropAction, type OtherDrop } from "./drop-transitions";
import { refundable } from "./order-admin-rules";
import { cancelOrderCore, dropEmailsOwed, sendDropCancellationEmails } from "./order-money";
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
/** Orders that cancelling their drop cancels: awaiting payment, paid, or packed. */
const OPEN_ORDER_STATES = ["pending_payment", "paid", "packed"] as const;

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
  /** As the shop sees it now (effectiveState). */
  state: DropState;
  /** As set by the lifecycle actions; the clock may have moved `state` past it. */
  storedState: DropState;
  /** Changes with every save and lifecycle action; the editor starts again from the stored drop when it does. */
  updatedAt: Date;
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
    storedState: d.state,
    updatedAt: d.updatedAt,
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

/**
 * Create a draft drop (no `slug`), or save the one with that slug, applying only what its state lets change.
 * `drawnFor` is the state the form was drawn for: if the drop has since moved to a state that locks different
 * fields, the save is refused (errors.state) rather than silently keeping the stored values for them.
 */
export async function saveDrop(value: DropValue, slug: string | null, drawnFor?: DropState): Promise<Saved> {
  try {
    return await getDb().transaction(async (tx) => (slug === null ? create(tx, value) : update(tx, value, slug, drawnFor)));
  } catch (e) {
    if (e instanceof Refused) return { ok: false, errors: e.errors };
    if (slug === null && isUniqueViolation(e)) return { ok: false, errors: { number: "Another drop already has this number." } };
    throw e;
  }
}

async function create(tx: Tx, v: DropValue): Promise<Saved> {
  // Numbering is serialised with Duplicate (the same lock): a duplicate started meanwhile waits, then sees this
  // number in max(number) instead of taking it too and failing on the unique constraint when this commits.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('drop-number'))`);
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

/**
 * The lock every writer that can change a public selling window takes first, before any row: saves (a scheduled
 * drop's dates) and lifecycle actions alike, so the one-open-drop rule is checked and committed in turn.
 */
const lockLifecycle = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('drop-lifecycle'))`);

/** Every other drop's selling window with its effective state, for the one-open-drop rule (drop-transitions.ts). */
async function otherWindows(tx: Tx, dropId: string, offset: number, now: Date): Promise<OtherDrop[]> {
  const rows = await tx.select({ number: drops.number, state: drops.state, openAt: drops.openAt, closeAt: drops.closeAt, shipAt: drops.shipAt }).from(drops).where(ne(drops.id, dropId));
  return Promise.all(rows.map(async (o) => ({ number: o.number, state: await liveState(o, offset, now), openAt: o.openAt, closeAt: o.closeAt })));
}

async function update(tx: Tx, v: DropValue, slug: string, drawnFor?: DropState): Promise<Saved> {
  await lockLifecycle(tx);
  const now = new Date();
  const offset = await arrivalOffsetDays();
  const [d] = await tx.select().from(drops).where(eq(drops.slug, slug)).for("update");
  if (!d) throw new Refused({ form: "That drop no longer exists." });
  const state = await liveState(d, offset, now);
  if (drawnFor && !sameEditability(drawnFor, state)) {
    throw new Refused({ state: `This drop is now ${state}, so a different set of fields can change. Reload the page to see what it has now, then make your change again.` });
  }
  const can = editable(state);
  // A scheduled drop's dates are public: the window they make must stay clear of every other scheduled or open drop's,
  // the same rule Schedule applies, so the clock can never open two drops at once.
  if (state === "scheduled" && can.dates) {
    const clash = windowClash(v.openAt, v.closeAt, await otherWindows(tx, d.id, offset, now));
    if (clash) throw new Refused({ openAt: clashMessage(clash, now) });
  }
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
    const changes = { ...(can.caps ? { cap: b.cap, maxPerCustomer: b.maxPerCustomer } : {}), ...(can.prices ? { price: b.price } : {}), ...(can.boxes ? { sort: i } : {}) };
    // Once shipped, only the names can change: an empty update would make Drizzle throw and roll the names back too.
    if (Object.keys(changes).length) await tx.update(dropBoxes).set(changes).where(eq(dropBoxes.id, existing.id));
  }
  if (Object.keys(errors).length) throw new Refused(errors);
  return { ok: true, slug };
}

export type Transitioned = { ok: true; state: DropState } | { ok: false; error: string };

/**
 * A lifecycle action (drop-transitions.ts) applied under the lifecycle lock and the drop's row lock. Mark complete
 * also delivers the drop's shipped orders (PRD 5.2b), which is what customers see as "Delivered": it locks those
 * orders before the drop row, the order the customer paths use (account.ts cancels and slot changes lock the
 * order, then its drop), and delivers exactly the orders it locked, so the two can't deadlock.
 */
export async function transitionDrop(slug: string, action: DropAction, input: { closeAt?: Date | null } = {}, now = new Date()): Promise<Transitioned> {
  if (action === "cancel") return { ok: false, error: "Cancelling a drop cancels its orders too. Use Cancel drop." };
  const offset = await arrivalOffsetDays();
  return getDb().transaction(async (tx) => {
    await lockLifecycle(tx);
    const [found] = await tx.select({ id: drops.id }).from(drops).where(eq(drops.slug, slug));
    if (!found) return { ok: false, error: "That drop no longer exists." };
    const shipped = action === "complete"
      ? await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.dropId, found.id), eq(orders.state, "shipped"))).for("update")
      : [];
    const [d] = await tx.select().from(drops).where(eq(drops.id, found.id)).for("update");
    if (!d) return { ok: false, error: "That drop no longer exists." };
    const others = await otherWindows(tx, d.id, offset, now);
    const r = transition({ ...d, arriveAt: arrivalDate(d.shipAt, offset) }, action, { now, others, closeAt: input.closeAt, undelivered: shipped.length });
    if (!r.ok) return r;
    if (action === "reopen") {
      // A reopened drop lets customers cancel again, but not an order that's been packed or sent. Packing shares this
      // drop's row lock (fulfilment.ts), so with the drop locked this count can't change before the commit.
      const [{ n }] = await tx.select({ n: count() }).from(orders).where(and(eq(orders.dropId, d.id), inArray(orders.state, ["packed", "shipped", "complete"])));
      if (n) return { ok: false, error: `${n === 1 ? "One of its orders is" : `${n} of its orders are`} already packed or shipped, so it can't reopen. A packed order can be unticked on the pack list.` };
    }
    await tx.update(drops).set({ ...r.patch, updatedAt: now }).where(eq(drops.id, d.id));
    if (action === "complete" && shipped.length) await tx.update(orders).set({ state: "complete", updatedAt: now }).where(inArray(orders.id, shipped.map((o) => o.id)));
    return { ok: true, state: r.patch.state };
  });
}

export interface CancelImpact {
  /** Orders Cancel drop would cancel. */
  orders: number;
  /** What it would refund: the rest of every paid order's payment. */
  refund: number;
  /**
   * A version of exactly what the confirmation showed: each order's id and state and the money on it. Cancel drop
   * refuses unless the orders it locks still match, so it never acts on an order, or a refund total, the owner didn't
   * see (a count alone can't tell one order swapped for another).
   */
  version: string;
}

interface ImpactRow { id: string; state: string; total: number; paidAt: Date | null; refunded: number }

function impactOf(rows: ImpactRow[]): CancelImpact {
  const lines = rows.map((r) => `${r.id}:${r.state}:${r.total}:${r.paidAt ? "paid" : "unpaid"}:${r.refunded}`).sort();
  return { orders: rows.length, refund: rows.reduce((n, r) => n + refundable(r), 0), version: createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 32) };
}

/** What Cancel drop would do right now, for its confirmation. */
export async function cancelImpact(slug: string): Promise<CancelImpact> {
  const rows = await getDb()
    // The outer column is named with its table: in raw sql Drizzle can write ${orders.id} as a bare "id" (orders-admin.ts).
    .select({ id: orders.id, state: orders.state, total: orders.total, paidAt: orders.paidAt, refunded: sql<number>`coalesce((select sum(r.amount) from refunds r where r.order_id = "orders"."id"), 0)::int` })
    .from(orders)
    .innerJoin(drops, eq(drops.id, orders.dropId))
    .where(and(eq(drops.slug, slug), inArray(orders.state, [...OPEN_ORDER_STATES])));
  return impactOf(rows);
}

/** What each of these (locked) orders has had refunded so far. */
async function refundedBy(tx: Tx, orderIds: string[]): Promise<Map<string, number>> {
  if (!orderIds.length) return new Map();
  const rows = await tx.select({ orderId: refunds.orderId, n: sql<number>`sum(${refunds.amount})::int` }).from(refunds).where(inArray(refunds.orderId, orderIds)).groupBy(refunds.orderId);
  return new Map(rows.map((r) => [r.orderId, r.n]));
}

export type CancelDropResult =
  | { ok: true; cancelled: number; refund: number; emailed: number; emailFailed: number }
  /** `stale`: the orders changed since the confirmation was drawn; the page reloads them for the owner to look again. */
  | { ok: false; error: string; stale?: true };

const STALE = "The orders on this drop have changed since this page loaded (a checkout finished, or an order was cancelled or refunded). The numbers above are up to date now: check them, then confirm again.";

/**
 * Cancel drop (PRD 4.2, 5.2a): the drop leaves the shop for good, every order on it is cancelled through
 * cancelOrderCore (the rest of each payment refunded, owed until Stripe), and then each customer is emailed.
 * `expectVersion` is the confirmation's CancelImpact.version: if the orders changed since, nothing happens. A drop
 * with shipped orders can't be cancelled; those get refunds.
 *
 * The emails go after the commit, from what the cancellation stored (sendDropCancellationEmails), so if the request
 * dies partway through the list, resendDropEmails finishes it.
 */
export async function cancelDrop(slug: string, adminId: string, expectVersion: string, opts: { now?: Date; gapMs?: number } = {}): Promise<CancelDropResult> {
  const now = opts.now ?? new Date();
  const offset = await arrivalOffsetDays();
  const r = await getDb().transaction(async (tx) => {
    await lockLifecycle(tx);
    const [found] = await tx.select({ id: drops.id }).from(drops).where(eq(drops.slug, slug));
    if (!found) return { ok: false as const, error: "That drop no longer exists." };
    // Orders, then the drop: the order a customer's own cancel or slot change locks them in (as Mark complete does).
    // Nothing is locked after the drop. Locking an order placed between the two would deadlock with its customer,
    // who holds that order and waits for the drop; such an order only makes the confirmation stale instead.
    const list = await tx.select().from(orders).where(and(eq(orders.dropId, found.id), inArray(orders.state, [...OPEN_ORDER_STATES]))).orderBy(asc(orders.createdAt)).for("update");
    const [d] = await tx.select().from(drops).where(eq(drops.id, found.id)).for("update");
    if (!d) return { ok: false as const, error: "That drop no longer exists." };
    const t = transition({ ...d, arriveAt: arrivalDate(d.shipAt, offset) }, "cancel", { now, others: [] });
    if (!t.ok) return t;
    const [{ n: shipped }] = await tx.select({ n: count() }).from(orders).where(and(eq(orders.dropId, d.id), inArray(orders.state, ["shipped", "complete"])));
    if (shipped) return { ok: false as const, error: `${shipped === 1 ? "One of its orders has" : `${shipped} of its orders have`} shipped, so the drop can't be cancelled. Refund orders one by one instead.` };
    // With the drop locked no checkout can place another order, so this read is the final list.
    const current = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.dropId, d.id), inArray(orders.state, [...OPEN_ORDER_STATES])));
    const locked = new Set(list.map((o) => o.id));
    if (current.length !== locked.size || current.some((o) => !locked.has(o.id))) return { ok: false as const, error: STALE, stale: true as const };
    const refunded = await refundedBy(tx, [...locked]);
    if (impactOf(list.map((o) => ({ ...o, refunded: refunded.get(o.id) ?? 0 }))).version !== expectVersion) return { ok: false as const, error: STALE, stale: true as const };
    await tx.update(drops).set({ state: "cancelled", updatedAt: now }).where(eq(drops.id, d.id));
    let refund = 0;
    for (const o of list) refund += (await cancelOrderCore(tx, o, { source: "drop", actorId: adminId }, now)).refund ?? 0;
    return { ok: true as const, dropId: d.id, cancelled: list.length, refund };
  });
  if (!r.ok) return r;
  const sent = await sendDropCancellationEmails(r.dropId, opts.gapMs);
  return { ok: true, cancelled: r.cancelled, refund: r.refund, ...sent };
}

/**
 * How many of the drop's orders have shipped but not been delivered. On a drop stored complete these shipped after
 * Mark complete ran (a late parcel), and Mark complete is offered again to deliver them (actionsFor).
 */
export async function undeliveredCount(slug: string): Promise<number> {
  const [r] = await getDb().select({ n: count() }).from(orders).innerJoin(drops, eq(drops.id, orders.dropId)).where(and(eq(drops.slug, slug), eq(orders.state, "shipped")));
  return r?.n ?? 0;
}

/** How many of a cancelled drop's customers are still owed their cancellation email (a failed send, or an interrupted one). */
export async function dropEmailsOwedCount(slug: string): Promise<number> {
  const [d] = await getDb().select({ id: drops.id, state: drops.state }).from(drops).where(eq(drops.slug, slug));
  return d?.state === "cancelled" ? (await dropEmailsOwed(d.id)).length : 0;
}

export type ResendDropEmailsResult = { ok: true; emailed: number; emailFailed: number } | { ok: false; error: string };

/** Send a cancelled drop's owed cancellation emails: only those, never cancelling or refunding anything again. */
export async function resendDropEmails(slug: string, opts: { gapMs?: number } = {}): Promise<ResendDropEmailsResult> {
  const [d] = await getDb().select({ id: drops.id, state: drops.state }).from(drops).where(eq(drops.slug, slug));
  if (!d) return { ok: false, error: "That drop no longer exists." };
  if (d.state !== "cancelled") return { ok: false, error: "Only a cancelled drop has cancellation emails to send." };
  const r = await sendDropCancellationEmails(d.id, opts.gapMs);
  if (!r.emailed && !r.emailFailed) return { ok: false, error: "Every customer has had their cancellation email." };
  return { ok: true, ...r };
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
