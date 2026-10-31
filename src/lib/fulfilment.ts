import "server-only";
import { and, asc, count, eq, gt, inArray, sql, sum } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { boxItems, dropBoxes, drops, inventoryHolds, orderItems, orders } from "@/db/schema";
import { arrivalDate, effectiveState, type DropState } from "./data";
import type { DeliverySlot } from "./delivery-slots";
import { canPack, packRefusal, packStateRefusal, productionPlan, type OpenCheckouts, type ProductionPlan } from "./fulfilment-rules";
import type { OrderState } from "./order-status";
import { arrivalOffsetDays } from "./settings";

/**
 * The kitchen's and the packing table's pages (PRD 4.5, 4.6): the production
 * sheet, the pack list, and ticking an order off as packed.
 */

/** Orders the kitchen bakes for and the packing table packs: paid, and not cancelled. */
const SOLD_STATES = ["paid", "packed", "shipped", "complete"] as const;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Read a page's data from one snapshot of the database (REPEATABLE READ, read only). The sheet and the list read the
 * paid orders and the live holds separately, and paying moves a checkout from one to the other in a single commit
 * (markPaid deletes its holds). Read at different moments, a checkout paid in between would be in neither, and the
 * sheet would call itself final without it; read from one snapshot, it's in exactly one of them.
 */
function inSnapshot<T>(read: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(read, { isolationLevel: "repeatable read", accessMode: "read only" });
}

/** Tests pause the reads here, after the paid orders and before the holds, to commit a checkout in the middle. */
let betweenReads: (() => Promise<void>) | null = null;
export function setBetweenReadsForTest(hook: (() => Promise<void>) | null) {
  betweenReads = hook;
}

export interface SheetDrop {
  slug: string;
  number: number;
  nameEn: string;
  /** Effective: the stored state moved on by the clock. */
  state: DropState;
  closeAt: Date;
  bakeAt: Date | null;
  shipAt: Date;
  arriveAt: Date;
}

async function sheetDrop(tx: Tx, slug: string, offset: number, now: Date) {
  const d = await tx.query.drops.findFirst({ where: eq(drops.slug, slug) });
  if (!d) return null;
  const arriveAt = arrivalDate(d.shipAt, offset);
  const head: SheetDrop = { slug: d.slug, number: d.number, nameEn: d.nameEn, state: effectiveState({ ...d, arriveAt }, now), closeAt: d.closeAt, bakeAt: d.bakeAt, shipAt: d.shipAt, arriveAt };
  return { id: d.id, head };
}

/**
 * Checkouts holding boxes on the drop that can still be paid: holds that haven't run out. Paying removes an order's
 * holds (markPaid), so every live hold is a checkout still in progress; one checkout's holds share a cart (or, once
 * placed, an order).
 */
async function openCheckouts(tx: Tx, dropId: string, now: Date): Promise<OpenCheckouts> {
  const [r] = await tx
    .select({
      checkouts: sql<number>`count(distinct coalesce(${inventoryHolds.cartId}, ${inventoryHolds.orderId}))`.mapWith(Number),
      boxes: sql<number>`coalesce(sum(${inventoryHolds.qty}), 0)`.mapWith(Number),
      until: sql<Date | null>`max(${inventoryHolds.expiresAt})`.mapWith((v) => (v ? new Date(v) : null)),
    })
    .from(inventoryHolds)
    .innerJoin(dropBoxes, eq(dropBoxes.id, inventoryHolds.dropBoxId))
    .where(and(eq(dropBoxes.dropId, dropId), gt(inventoryHolds.expiresAt, now)));
  return r;
}

export interface ProductionSheet {
  drop: SheetDrop;
  plan: ProductionPlan;
  /** Checkouts that can still be paid, and aren't counted until they are. */
  open: OpenCheckouts;
  orders: number;
  /** Orders with a handwritten card. */
  giftCards: number;
}

/**
 * The production sheet (PRD 4.5): what to bake for the drop's paid orders, the boxes to assemble and the cards to
 * write. While the drop is open it's a projection that grows with each order, and after it closes it isn't final
 * until the checkouts begun before the close have been paid or run out (`open`; sheetStanding). It uses each box's
 * recipe as it is now (Boxes & items), since that's what the kitchen will make.
 */
export async function productionSheet(slug: string, now = new Date()): Promise<ProductionSheet | null> {
  const offset = await arrivalOffsetDays();
  // One snapshot (inSnapshot), so a checkout paid while this runs is either counted or still held, never neither.
  // One connection runs the reads in turn.
  const read = await inSnapshot(async (tx) => {
    const found = await sheetDrop(tx, slug, offset, now);
    if (!found) return null;
    const sold = and(eq(orders.dropId, found.id), inArray(orders.state, SOLD_STATES));
    const dropBoxRows = await tx.query.dropBoxes.findMany({
      where: eq(dropBoxes.dropId, found.id),
      orderBy: [asc(dropBoxes.sort)],
      with: { box: { columns: { nameEn: true }, with: { boxItems: { orderBy: [asc(boxItems.itemId)], with: { item: true } } } } },
    });
    const soldRows = await tx.select({ dropBoxId: orderItems.dropBoxId, n: sum(orderItems.qty).mapWith(Number) }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(sold).groupBy(orderItems.dropBoxId);
    const [counts] = await tx.select({ orders: count(), giftCards: sql<number>`count(*) filter (where btrim(coalesce(${orders.giftMessage}, '')) <> '')`.mapWith(Number) }).from(orders).where(sold);
    await betweenReads?.();
    const open = await openCheckouts(tx, found.id, now);
    return { found, dropBoxRows, soldRows, counts, open };
  });
  if (!read) return null;
  const { found, dropBoxRows, soldRows, counts, open } = read;
  const soldBy = new Map(soldRows.map((r) => [r.dropBoxId, r.n]));
  const plan = productionPlan(
    dropBoxRows.map((x) => ({
      nameEn: x.box.nameEn,
      sold: soldBy.get(x.id) ?? 0,
      recipe: x.box.boxItems.map((bi) => ({ qty: bi.qty, item: { slug: bi.item.slug, nameEn: bi.item.nameEn, nameJa: bi.item.nameJa, productionUnit: bi.item.productionUnit, unitsPerProductionUnit: bi.item.unitsPerProductionUnit, bakeBuffer: bi.item.bakeBuffer } })),
    })),
  );
  return { drop: found.head, plan, open, orders: counts.orders, giftCards: counts.giftCards };
}

export interface PackRow {
  number: string;
  state: OrderState;
  packedAt: Date | null;
  shipToName: string;
  /** "目黒区": where it's going, without the full address (that's on the label). */
  ward: string;
  slot: DeliverySlot;
  lines: { name: string; qty: number }[];
  giftMessage: string | null;
}

export interface PackList {
  drop: SheetDrop;
  /** Whether orders on it can be packed now (canPack()), and why not. */
  packable: boolean;
  refusal: string | null;
  /** Checkouts that can still be paid, whose orders will join the list when they are. */
  open: OpenCheckouts;
  rows: PackRow[];
}

/** The pack list (PRD 4.6): one row per paid order, by order number, with what goes in the box and on the card. */
export async function packList(slug: string, now = new Date()): Promise<PackList | null> {
  const offset = await arrivalOffsetDays();
  // One snapshot, as the sheet: a checkout paid meanwhile is either a row or still held, never neither.
  const read = await inSnapshot(async (tx) => {
    const found = await sheetDrop(tx, slug, offset, now);
    if (!found) return null;
    const rows = await tx.query.orders.findMany({
      where: and(eq(orders.dropId, found.id), inArray(orders.state, SOLD_STATES)),
      orderBy: [asc(orders.number)],
      columns: { number: true, state: true, packedAt: true, shipToName: true, city: true, deliveryTimeSlot: true, giftMessage: true },
      with: { items: { columns: { nameEn: true, qty: true }, orderBy: [asc(orderItems.nameEn)] } },
    });
    await betweenReads?.();
    return { found, rows, open: await openCheckouts(tx, found.id, now) };
  });
  if (!read) return null;
  const { found, rows, open } = read;
  const packable = canPack(found.head.state);
  return {
    drop: found.head,
    packable,
    refusal: packable ? null : packRefusal(found.head.state),
    open,
    rows: rows.map((o) => ({
      number: o.number,
      state: o.state,
      packedAt: o.packedAt,
      shipToName: o.shipToName,
      ward: o.city,
      slot: o.deliveryTimeSlot,
      lines: o.items.map((i) => ({ name: i.nameEn, qty: i.qty })),
      giftMessage: o.giftMessage?.trim() || null,
    })),
  };
}

export type PackResult = { ok: true; packedAt: Date | null } | { ok: false; error: string };

/**
 * Tick an order off as packed, or untick it (PRD 4.6, 5.2b: paid ⇄ packed). Only once its drop has closed: packing
 * ends the customer's chance to cancel or change the delivery time. Asking for the state it's already in is fine (a
 * second tab, a double click) and changes nothing.
 */
export async function setPacked(number: string, packed: boolean, now = new Date()): Promise<PackResult> {
  const offset = await arrivalOffsetDays();
  return getDb().transaction(async (tx) => {
    const [o] = await tx.select({ id: orders.id, state: orders.state, dropId: orders.dropId, packedAt: orders.packedAt }).from(orders).where(eq(orders.number, number)).for("update");
    if (!o) return { ok: false as const, error: "That order no longer exists." };
    // Order, then drop: the order a customer's cancel locks them in. Sharing the drop's lock keeps Reopen waiting until
    // this commits, and Reopen refuses while any order is packed (drops-admin.ts).
    const [d] = await tx.select().from(drops).where(eq(drops.id, o.dropId)).for("share");
    if (o.state === (packed ? "packed" : "paid")) return { ok: true as const, packedAt: o.packedAt };
    if (o.state !== (packed ? "paid" : "packed")) return { ok: false as const, error: packStateRefusal(o.state) };
    const dropState = effectiveState({ ...d, arriveAt: arrivalDate(d.shipAt, offset) }, now);
    if (!canPack(dropState)) return { ok: false as const, error: packRefusal(dropState) };
    const packedAt = packed ? now : null;
    await tx.update(orders).set({ state: packed ? "packed" : "paid", packedAt, updatedAt: now }).where(eq(orders.id, o.id));
    return { ok: true as const, packedAt };
  });
}
