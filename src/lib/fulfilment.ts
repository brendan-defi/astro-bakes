import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
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

type DropRow = typeof drops.$inferSelect;

/**
 * Read a page's data so that no checkout can go missing from it: a hold may still be paid after the drop closes
 * (PRD 3.8), and the sheet mustn't say Final without it.
 *
 * 1. Share the drop's row lock first. A checkout is accepted holding that lock from checking its hold until it
 *    commits (placeOrder), and holds are made under it (startCheckout). So this waits for any checkout part-way
 *    through, and keeps new ones out until the reads are done. `now`, which decides which holds are live, is taken
 *    after that: a hold that has run out by then can't belong to an accepted checkout still to commit, and a checkout
 *    accepted afterwards has a hold that outlasts `now`, so it's counted as open.
 * 2. Read the live holds before the paid orders. Paying moves a checkout from one to the other in a single commit
 *    (markPaid, which Stripe's webhook will run without the drop's lock). In this order a payment landing between the
 *    reads is seen twice, still held and paid, never neither, so the page stays provisional rather than final
 *    without it.
 *
 * (A REPEATABLE READ snapshot can't do the first: it's taken when the first statement starts, before the lock wait.)
 */
function readSettled<T>(slug: string, read: (tx: Tx, d: DropRow, now: Date) => Promise<T>): Promise<T | null> {
  return getDb().transaction(async (tx) => {
    const [d] = await tx.select().from(drops).where(eq(drops.slug, slug)).for("share");
    return d ? read(tx, d, new Date()) : null;
  });
}

/** Tests pause the reads here, after the holds and before the paid orders, to pay for a checkout in the middle. */
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

function sheetDrop(d: DropRow, offset: number, now: Date): SheetDrop {
  const arriveAt = arrivalDate(d.shipAt, offset);
  return { slug: d.slug, number: d.number, nameEn: d.nameEn, state: effectiveState({ ...d, arriveAt }, now), closeAt: d.closeAt, bakeAt: d.bakeAt, shipAt: d.shipAt, arriveAt };
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
 * until the checkouts begun before the close have been paid or run out (`open`; sheetStanding, readSettled). It uses
 * each box's recipe as it is now (Boxes & items), since that's what the kitchen will make.
 */
export async function productionSheet(slug: string): Promise<ProductionSheet | null> {
  const offset = await arrivalOffsetDays();
  const read = await readSettled(slug, async (tx, d, now) => {
    const open = await openCheckouts(tx, d.id, now);
    await betweenReads?.();
    // The paid orders in one statement, so the box counts, the order count and the cards all agree.
    const paid = await tx.query.orders.findMany({
      where: and(eq(orders.dropId, d.id), inArray(orders.state, SOLD_STATES)),
      columns: { giftMessage: true },
      with: { items: { columns: { dropBoxId: true, qty: true } } },
    });
    const dropBoxRows = await tx.query.dropBoxes.findMany({
      where: eq(dropBoxes.dropId, d.id),
      orderBy: [asc(dropBoxes.sort)],
      with: { box: { columns: { nameEn: true }, with: { boxItems: { orderBy: [asc(boxItems.itemId)], with: { item: true } } } } },
    });
    return { head: sheetDrop(d, offset, now), open, paid, dropBoxRows };
  });
  if (!read) return null;
  const { head, open, paid, dropBoxRows } = read;
  const soldBy = new Map<string, number>();
  for (const it of paid.flatMap((o) => o.items)) soldBy.set(it.dropBoxId, (soldBy.get(it.dropBoxId) ?? 0) + it.qty);
  const plan = productionPlan(
    dropBoxRows.map((x) => ({
      nameEn: x.box.nameEn,
      sold: soldBy.get(x.id) ?? 0,
      recipe: x.box.boxItems.map((bi) => ({ qty: bi.qty, item: { slug: bi.item.slug, nameEn: bi.item.nameEn, nameJa: bi.item.nameJa, productionUnit: bi.item.productionUnit, unitsPerProductionUnit: bi.item.unitsPerProductionUnit, bakeBuffer: bi.item.bakeBuffer } })),
    })),
  );
  return { drop: head, plan, open, orders: paid.length, giftCards: paid.filter((o) => o.giftMessage?.trim()).length };
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
export async function packList(slug: string): Promise<PackList | null> {
  const offset = await arrivalOffsetDays();
  // As the sheet (readSettled): holds first, then the orders, so a checkout paid meanwhile is still shown as pending.
  const read = await readSettled(slug, async (tx, d, now) => {
    const open = await openCheckouts(tx, d.id, now);
    await betweenReads?.();
    const rows = await tx.query.orders.findMany({
      where: and(eq(orders.dropId, d.id), inArray(orders.state, SOLD_STATES)),
      orderBy: [asc(orders.number)],
      columns: { number: true, state: true, packedAt: true, shipToName: true, city: true, deliveryTimeSlot: true, giftMessage: true },
      with: { items: { columns: { nameEn: true, qty: true }, orderBy: [asc(orderItems.nameEn)] } },
    });
    return { head: sheetDrop(d, offset, now), open, rows };
  });
  if (!read) return null;
  const { head, open, rows } = read;
  const packable = canPack(head.state);
  return {
    drop: head,
    packable,
    refusal: packable ? null : packRefusal(head.state),
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
