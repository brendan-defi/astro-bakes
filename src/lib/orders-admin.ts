import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, drops, notificationLog, orderEvents, orderItems, orders, refunds } from "@/db/schema";
import { addressLine } from "./address";
import { arrivalDate } from "./data";
import type { DeliverySlot } from "./delivery-slots";
import { buildTimeline, displayState, likeAnywhere, PAGE_SIZE, type DisplayState, type OrderFilters, type TimelineEntry } from "./order-admin-rules";
import { arrivalOffsetDays } from "./settings";

/**
 * The admin's order pages (PRD 4.4): the filtered list, one order with its
 * timeline, internal notes, and the CSV export. Read-only apart from notes;
 * cancelling, refunds and shipping come in later PRs.
 */

/**
 * Does a checkout still hold this order's boxes? (Holds point at the order, or at the cart it was placed from.) The
 * outer columns are named with their table on purpose: in a single-table select Drizzle writes `${orders.id}` as a
 * bare "id", which inside this subquery would mean the hold's own id.
 */
const liveHold = sql<boolean>`exists (select 1 from inventory_holds h where (h.order_id = "orders"."id" or h.cart_id = "orders"."checkout_id") and h.expires_at > now())`;

function whereFor(f: OrderFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (f.drop) conds.push(eq(drops.slug, f.drop));
  if (f.state === "pending_payment") conds.push(and(eq(orders.state, "pending_payment"), liveHold));
  else if (f.state === "expired") conds.push(or(eq(orders.state, "expired"), and(eq(orders.state, "pending_payment"), sql`not ${liveHold}`)));
  else if (f.state) conds.push(eq(orders.state, f.state));
  if (f.q) {
    const like = likeAnywhere(f.q);
    conds.push(or(ilike(orders.number, like), ilike(customers.email, like), ilike(customers.name, like), ilike(orders.shipToName, like), ilike(orders.phone, like)));
  }
  return conds.length ? and(...conds) : undefined;
}

export interface OrderRow {
  number: string;
  state: DisplayState;
  placedAt: Date;
  customer: string;
  email: string;
  shipToName: string;
  boxes: string;
  boxCount: number;
  total: number;
  paymentMethod: "card" | "paypay" | null;
  drop: { slug: string; number: number };
  gift: boolean;
}

/** Lines per order, "2 × 8 Cookie Box, 1 × Baker's Dozen", for the orders given. */
async function linesFor(ids: string[]) {
  if (!ids.length) return new Map<string, { text: string; count: number }>();
  const rows = await getDb().select({ orderId: orderItems.orderId, name: orderItems.nameEn, qty: orderItems.qty }).from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.nameEn));
  const out = new Map<string, { text: string; count: number }>();
  for (const r of rows) {
    const cur = out.get(r.orderId) ?? { text: "", count: 0 };
    out.set(r.orderId, { text: cur.text ? `${cur.text}, ${r.qty} × ${r.name}` : `${r.qty} × ${r.name}`, count: cur.count + r.qty });
  }
  return out;
}

const listColumns = {
  id: orders.id,
  number: orders.number,
  state: orders.state,
  createdAt: orders.createdAt,
  total: orders.total,
  paymentMethod: orders.paymentMethodType,
  shipToName: orders.shipToName,
  giftMessage: orders.giftMessage,
  customerName: customers.name,
  email: customers.email,
  dropSlug: drops.slug,
  dropNumber: drops.number,
  liveHold,
};

/** One page of orders, newest first, and how many match in all. */
export async function listOrders(f: OrderFilters): Promise<{ rows: OrderRow[]; total: number }> {
  const db = getDb();
  const where = whereFor(f);
  const [rows, [{ n }]] = await Promise.all([
    db.select(listColumns).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).innerJoin(drops, eq(drops.id, orders.dropId)).where(where).orderBy(desc(orders.createdAt), desc(orders.number)).limit(PAGE_SIZE).offset((f.page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).innerJoin(drops, eq(drops.id, orders.dropId)).where(where),
  ]);
  const lines = await linesFor(rows.map((r) => r.id));
  return {
    total: n,
    rows: rows.map((r) => ({
      number: r.number,
      state: displayState(r.state, r.liveHold),
      placedAt: r.createdAt,
      customer: r.customerName ?? r.shipToName,
      email: r.email,
      shipToName: r.shipToName,
      boxes: lines.get(r.id)?.text ?? "",
      boxCount: lines.get(r.id)?.count ?? 0,
      total: r.total,
      paymentMethod: r.paymentMethod,
      drop: { slug: r.dropSlug, number: r.dropNumber },
      gift: !!r.giftMessage,
    })),
  };
}

/** Every drop, newest first, for the filter. */
export async function dropFilterOptions(): Promise<{ slug: string; label: string }[]> {
  const rows = await getDb().select({ slug: drops.slug, number: drops.number, name: drops.nameEn }).from(drops).orderBy(desc(drops.number));
  return rows.map((d) => ({ slug: d.slug, label: d.name }));
}

export interface OrderDetail {
  number: string;
  state: DisplayState;
  storedState: string;
  placedAt: Date;
  locale: "en" | "ja";
  customer: { name: string | null; email: string; phone: string | null; verified: boolean };
  shipTo: { name: string; phone: string; address: string; ward: string | null };
  slot: DeliverySlot;
  giftMessage: string | null;
  lines: { name: string; nameJa: string | null; qty: number; unitPrice: number }[];
  subtotal: number;
  shippingFee: number;
  total: number;
  refunded: number;
  payment: { method: "card" | "paypay" | null; paidAt: Date | null; intent: string | null };
  drop: { slug: string; number: number; name: string; shipAt: Date; arriveAt: Date };
  trackingNumber: string | null;
  timeline: TimelineEntry[];
}

export async function orderDetail(number: string): Promise<OrderDetail | null> {
  const db = getDb();
  const [row] = await db.select({ id: orders.id, liveHold }).from(orders).where(eq(orders.number, number));
  if (!row) return null;
  const [o, emails, events, offset] = await Promise.all([
    db.query.orders.findFirst({ where: eq(orders.id, row.id), with: { drop: true, customer: true, items: { orderBy: [asc(orderItems.nameEn)] }, refunds: { orderBy: [asc(refunds.createdAt)] } } }),
    db.select().from(notificationLog).where(eq(notificationLog.orderId, row.id)).orderBy(asc(notificationLog.sentAt)),
    db.query.orderEvents.findMany({ where: eq(orderEvents.orderId, row.id), orderBy: [asc(orderEvents.createdAt)], with: { actor: { columns: { email: true, name: true } } } }),
    arrivalOffsetDays(),
  ]);
  if (!o) return null;
  return {
    number: o.number,
    state: displayState(o.state, row.liveHold),
    storedState: o.state,
    placedAt: o.createdAt,
    locale: o.locale,
    customer: { name: o.customer.name, email: o.customer.email, phone: o.customer.phone, verified: !!o.customer.emailVerifiedAt },
    shipTo: { name: o.shipToName, phone: o.phone, address: addressLine(o), ward: o.wardCode },
    slot: o.deliveryTimeSlot,
    giftMessage: o.giftMessage,
    lines: o.items.map((i) => ({ name: i.nameEn, nameJa: i.nameJa, qty: i.qty, unitPrice: i.unitPrice })),
    subtotal: o.subtotal,
    shippingFee: o.shippingFee,
    total: o.total,
    refunded: o.refunds.reduce((n, r) => n + r.amount, 0),
    payment: { method: o.paymentMethodType, paidAt: o.paidAt, intent: o.stripePaymentIntentId },
    drop: { slug: o.drop.slug, number: o.drop.number, name: o.drop.nameEn, shipAt: o.drop.shipAt, arriveAt: arrivalDate(o.drop.shipAt, offset) },
    trackingNumber: o.trackingNumber,
    timeline: buildTimeline({
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      cancelledAt: o.cancelledAt,
      packedAt: o.packedAt,
      shippedAt: o.shippedAt,
      trackingNumber: o.trackingNumber,
      state: o.state,
      systemNote: o.notes,
      refunds: o.refunds,
      emails: emails.map((e) => ({ type: e.type, to: e.to, sentAt: e.sentAt, error: e.error })),
      events: events.map((e) => ({ kind: e.kind, body: e.body, createdAt: e.createdAt, by: e.actor?.name || e.actor?.email || null })),
    }),
  };
}

/** Add an internal note to an order (never shown to the customer). */
export async function addOrderNote(number: string, adminId: string, body: string): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.number, number));
  if (!o) return { ok: false, error: "not_found" };
  await db.insert(orderEvents).values({ orderId: o.id, kind: "note", actorId: adminId, body });
  return { ok: true };
}

/** The CSV export (PRD 4.4, for the accounts): every matching order, oldest first, one row each. */
export async function ordersForCsv(f: OrderFilters): Promise<(string | number | null)[][]> {
  const db = getDb();
  const rows = await db
    .select({
      ...listColumns,
      paidAt: orders.paidAt,
      cancelledAt: orders.cancelledAt,
      shippedAt: orders.shippedAt,
      trackingNumber: orders.trackingNumber,
      phone: orders.phone,
      postalCode: orders.postalCode,
      prefecture: orders.prefecture,
      city: orders.city,
      town: orders.town,
      line1: orders.line1,
      line2: orders.line2,
      slot: orders.deliveryTimeSlot,
      subtotal: orders.subtotal,
      shippingFee: orders.shippingFee,
      // Outer column named with its table, as in liveHold above.
      refunded: sql<number>`coalesce((select sum(r.amount) from refunds r where r.order_id = "orders"."id"), 0)::int`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(drops, eq(drops.id, orders.dropId))
    .where(whereFor(f))
    .orderBy(asc(orders.createdAt), asc(orders.number));
  const lines = await linesFor(rows.map((r) => r.id));
  const jst = (d: Date | null) => (d ? new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") : "");
  const header = ["Order", "Drop", "Placed (JST)", "Paid (JST)", "Status", "Customer", "Email", "Recipient", "Phone", "Address", "Time slot", "Boxes", "Box count", "Gift message", "Subtotal", "Shipping", "Total", "Refunded", "Net", "Payment", "Shipped (JST)", "Tracking"];
  return [
    header,
    ...rows.map((r) => [
      r.number,
      `Drop ${String(r.dropNumber).padStart(2, "0")}`,
      jst(r.createdAt),
      jst(r.paidAt),
      displayState(r.state, r.liveHold),
      r.customerName ?? "",
      r.email,
      r.shipToName,
      r.phone,
      addressLine(r),
      r.slot,
      lines.get(r.id)?.text ?? "",
      lines.get(r.id)?.count ?? 0,
      r.giftMessage ?? "",
      r.subtotal,
      r.shippingFee,
      r.total,
      r.refunded,
      r.total - r.refunded,
      r.paymentMethod ?? "",
      jst(r.shippedAt),
      r.trackingNumber ?? "",
    ]),
  ];
}
