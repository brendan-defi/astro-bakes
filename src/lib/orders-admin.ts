import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, drops, notificationLog, orderEvents, orderItems, orders, refunds } from "@/db/schema";
import { sendOrderConfirmation } from "./account";
import { addressLine } from "./address";
import { validateDelivery } from "./checkout-rules";
import { arrivalDate, effectiveState, type DropState } from "./data";
import { isDeliverySlot, type DeliverySlot } from "./delivery-slots";
import { canPack, packRefusal } from "./fulfilment-rules";
import { getStrings } from "./i18n";
import {
  adminCanCancel, buildTimeline, canEditDelivery, canShip, cancelRefusal, DELIVERY_ERROR, deliveryRefusal, displayState, hasShipped, likeAnywhere, PAGE_SIZE,
  refundable, shipRefusal, textCell, validateRefund,
  type CsvValue, type DeliveryEdit, type DeliveryErrors, type DisplayState, type OrderFilters, type RefundErrors, type TimelineEntry,
} from "./order-admin-rules";
import { cancelOrderCore, recordRefund, refundedSoFar, sendCancellationEmail } from "./order-money";
import { sendShippedEmail, shipOrderCore } from "./order-shipping";
import { arrivalOffsetDays } from "./settings";
import { formatTracking, parseTracking, TRACKING_HELP } from "./tracking";

/**
 * The admin's order pages (PRD 4.4): the filtered list, one order with its
 * timeline, internal notes, the CSV export, the money actions (cancel & refund,
 * refunds without cancelling) and the delivery ones (mark shipped with a
 * tracking number, correct it, edit the recipient and address, resend emails).
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
  /** What's left to refund (refundable()). */
  refundable: number;
  /** Whether the shop can cancel it now (adminCanCancel()). */
  canCancel: boolean;
  payment: { method: "card" | "paypay" | null; paidAt: Date | null; intent: string | null };
  /** `state` as the shop sees it now: cancelled boxes go back on sale while it's open. */
  drop: { slug: string; number: number; name: string; state: DropState; shipAt: Date; arriveAt: Date };
  /** Digits, as stored (formatTracking to show). */
  trackingNumber: string | null;
  /** Shipping: whether it can be marked shipped now, why not if it's only the drop holding it back, and whether it has gone. */
  shipping: { canShip: boolean; blocked: string | null; shipped: boolean };
  /** The delivery form: the stored values, whether they can change, and a version the save must still match. */
  delivery: { value: DeliveryEdit; editable: boolean; refusal: string | null; version: string };
  /** Emails it can be sent again: the confirmation once paid (and not cancelled), the shipping email once shipped. */
  resend: { confirmation: boolean; shipped: boolean };
  timeline: TimelineEntry[];
}

/** The delivery details the edit form started from, so a save can tell if they changed under it (the customer's slot, say). */
function deliveryVersion(o: { shipToName: string; phone: string; postalCode: string; line1: string; line2: string | null; deliveryTimeSlot: string }): string {
  return createHash("sha256").update(JSON.stringify([o.shipToName, o.phone, o.postalCode, o.line1, o.line2 ?? "", o.deliveryTimeSlot])).digest("hex").slice(0, 32);
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
  const refunded = o.refunds.reduce((n, r) => n + r.amount, 0);
  const arriveAt = arrivalDate(o.drop.shipAt, offset);
  const dropState = effectiveState({ ...o.drop, arriveAt }, new Date());
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
    refunded,
    refundable: refundable({ paidAt: o.paidAt, total: o.total, refunded }),
    canCancel: adminCanCancel(o.state),
    payment: { method: o.paymentMethodType, paidAt: o.paidAt, intent: o.stripePaymentIntentId },
    drop: { slug: o.drop.slug, number: o.drop.number, name: o.drop.nameEn, state: dropState, shipAt: o.drop.shipAt, arriveAt },
    trackingNumber: o.trackingNumber,
    shipping: { canShip: canShip(o.state) && canPack(dropState), blocked: canShip(o.state) && !canPack(dropState) ? packRefusal(dropState, "ship") : null, shipped: hasShipped(o.state) },
    delivery: {
      value: { name: o.shipToName, phone: o.phone, postal: `${o.postalCode.slice(0, 3)}-${o.postalCode.slice(3)}`, line1: o.line1, line2: o.line2 ?? "", slot: o.deliveryTimeSlot },
      editable: canEditDelivery(o.state),
      refusal: canEditDelivery(o.state) ? null : deliveryRefusal(o.state),
      version: deliveryVersion(o),
    },
    resend: { confirmation: !!o.paidAt && o.state !== "cancelled", shipped: hasShipped(o.state) && !!o.trackingNumber },
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
      events: events.map((e) => ({ kind: e.kind, body: e.body, data: e.data, createdAt: e.createdAt, by: e.actor?.name || e.actor?.email || null })),
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

// ---------------------------------------------------------------- money (PRD 4.4)

export type AdminCancelResult =
  | { ok: true; refund: number | null; backOnSale: boolean; emailed: boolean | null }
  | { ok: false; error: string };

/**
 * Cancel & refund as the shop, at any time before the order ships (PRD 4.4, 5.2b). The rest of the payment is
 * refunded (owed until Stripe), and the boxes stop counting as sold, so they're back on sale if the drop is open.
 * `notify` emails the customer once it's done; leave it off for, say, an order placed to test the shop.
 */
export async function adminCancelOrder(number: string, adminId: string, opts: { note: string; notify: boolean }, now = new Date()): Promise<AdminCancelResult> {
  const offset = await arrivalOffsetDays();
  const r = await getDb().transaction(async (tx) => {
    // Order, then drop: the order a customer's own cancel locks them in.
    const [o] = await tx.select().from(orders).where(eq(orders.number, number)).for("update");
    if (!o) return { ok: false as const, error: "That order no longer exists." };
    const [d] = await tx.select().from(drops).where(eq(drops.id, o.dropId)).for("update");
    if (!adminCanCancel(o.state)) return { ok: false as const, error: cancelRefusal(o.state) };
    const { refund } = await cancelOrderCore(tx, o, { source: "admin", actorId: adminId, note: opts.note }, now);
    const backOnSale = effectiveState({ ...d, arriveAt: arrivalDate(d.shipAt, offset) }, now) === "open";
    return { ok: true as const, orderId: o.id, refund, backOnSale };
  });
  if (!r.ok) return r;
  const emailed = opts.notify ? await sendCancellationEmail(r.orderId) : null;
  return { ok: true, refund: r.refund, backOnSale: r.backOnSale, emailed };
}

export type AdminRefundResult = { ok: true; amount: number } | { ok: false; error?: string; errors?: RefundErrors };

/**
 * A refund without cancelling (PRD 4.4 "partial refund", D22: our failures, such as damage or non-delivery), up to
 * what's left of the payment. Stock and the order's state stay as they are. `expectRefunded` is what the page showed
 * as refunded already: if another refund has been recorded since (a second click, another tab), this one is refused
 * rather than refunding twice.
 */
export async function adminRefund(number: string, adminId: string, input: { amount?: unknown; reason?: unknown; note?: unknown }, expectRefunded: number): Promise<AdminRefundResult> {
  return getDb().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.number, number)).for("update");
    if (!o) return { ok: false as const, error: "That order no longer exists." };
    const refunded = await refundedSoFar(tx, o.id);
    if (refunded !== expectRefunded) return { ok: false as const, error: "Another refund was recorded since this page loaded. Check the timeline, then try again." };
    const left = refundable({ paidAt: o.paidAt, total: o.total, refunded });
    if (!left) return { ok: false as const, error: o.paidAt ? "It has been refunded in full already." : "It was never paid, so there's nothing to refund." };
    const v = validateRefund(input, left);
    if (!v.ok) return { ok: false as const, errors: v.errors };
    await recordRefund(tx, { orderId: o.id, amount: v.value.amount, reason: v.value.reason, actorId: adminId, note: v.value.note });
    return { ok: true as const, amount: v.value.amount };
  });
}

// ---------------------------------------------------------------- shipping and delivery (PRD 4.4, 4.6)

export type ShipResult = { ok: true; emailed: boolean | null } | { ok: false; error: string; field?: "tracking" };

const TRACKING_ERROR = `Enter the tracking number: ${TRACKING_HELP.charAt(0).toLowerCase()}${TRACKING_HELP.slice(1)}`;

/**
 * Add the tracking number and mark the order shipped (PRD 4.4, 4.6 "manual fallback"), once its drop has closed. The
 * customer is emailed the number and Japan Post's link unless `notify` is off (a test order).
 */
export async function adminShipOrder(number: string, adminId: string, input: { tracking: unknown; notify: boolean }, now = new Date()): Promise<ShipResult> {
  const tracking = parseTracking(input.tracking);
  if (!tracking) return { ok: false, error: TRACKING_ERROR, field: "tracking" };
  const offset = await arrivalOffsetDays();
  const r = await getDb().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.number, number)).for("update");
    if (!o) return { ok: false as const, error: "That order no longer exists." };
    // Order, then a share of the drop, as packing does: Reopen waits, then sees the shipped order and refuses.
    const [d] = await tx.select().from(drops).where(eq(drops.id, o.dropId)).for("share");
    if (!canShip(o.state)) return { ok: false as const, error: shipRefusal(o.state) };
    const dropState = effectiveState({ ...d, arriveAt: arrivalDate(d.shipAt, offset) }, now);
    if (!canPack(dropState)) return { ok: false as const, error: packRefusal(dropState, "ship") };
    await shipOrderCore(tx, o, tracking, adminId, now);
    return { ok: true as const, orderId: o.id };
  });
  if (!r.ok) return r;
  return { ok: true, emailed: input.notify ? await sendShippedEmail(r.orderId) : null };
}

/** Fix a shipped order's tracking number (a typo, a relabelled parcel), and email the customer the right one unless `notify` is off. */
export async function adminCorrectTracking(number: string, adminId: string, input: { tracking: unknown; notify: boolean }): Promise<ShipResult> {
  const tracking = parseTracking(input.tracking);
  if (!tracking) return { ok: false, error: TRACKING_ERROR, field: "tracking" };
  const r = await getDb().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.number, number)).for("update");
    if (!o) return { ok: false as const, error: "That order no longer exists." };
    if (!hasShipped(o.state)) return { ok: false as const, error: "It hasn't shipped yet, so there's no tracking number to correct." };
    if (o.trackingNumber === tracking) return { ok: false as const, error: "That's the tracking number it has already.", field: "tracking" as const };
    const from = o.trackingNumber ? formatTracking(o.trackingNumber) : "none";
    await tx.update(orders).set({ trackingNumber: tracking, updatedAt: new Date() }).where(eq(orders.id, o.id));
    await tx.insert(orderEvents).values({ orderId: o.id, kind: "tracking_changed", actorId: adminId, body: "Tracking number corrected", data: { from: o.trackingNumber, to: tracking, detail: `${from} → ${formatTracking(tracking)}` } });
    return { ok: true as const, orderId: o.id };
  });
  if (!r.ok) return r;
  return { ok: true, emailed: input.notify ? await sendShippedEmail(r.orderId, { corrected: true }) : null };
}

export type DeliveryResult = { ok: true; changed: boolean } | { ok: false; error?: string; errors?: DeliveryErrors };

/**
 * Change the recipient, phone, address or time slot until the order ships (PRD 4.4), for a customer who writes in.
 * Same rules as checkout: a real postal code inside the 23 wards, a Japanese phone number. `expectVersion` is the
 * version the form started from; if the details have changed since (the customer moved their slot), it's refused
 * rather than overwriting that. The customer isn't emailed; the confirmation can be sent again with the new details.
 */
export async function adminUpdateDelivery(number: string, adminId: string, input: Partial<Record<keyof DeliveryEdit, unknown>>, expectVersion: string): Promise<DeliveryResult> {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const raw = { name: str(input.name), phone: str(input.phone), postal: str(input.postal), line1: str(input.line1), line2: str(input.line2) };
  const v = validateDelivery(raw);
  const errors: DeliveryErrors = {};
  for (const code of v.errors) {
    const e = DELIVERY_ERROR[code];
    if (e && !errors[e.field]) errors[e.field] = e.text;
  }
  if (!isDeliverySlot(input.slot)) errors.slot = "Choose a time slot.";
  if (Object.keys(errors).length || !v.hit || !isDeliverySlot(input.slot)) return { ok: false, errors };
  const slot = input.slot;
  const hit = v.hit;
  return getDb().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.number, number)).for("update");
    if (!o) return { ok: false as const, error: "That order no longer exists." };
    if (!canEditDelivery(o.state)) return { ok: false as const, error: deliveryRefusal(o.state) };
    if (deliveryVersion(o) !== expectVersion) return { ok: false as const, error: "The delivery details changed since this page loaded (the customer may have changed their time slot). Reload to see them, then try again." };
    const next = { shipToName: raw.name.trim(), phone: v.phone, postalCode: v.postal, prefecture: hit.prefecture, city: hit.city, town: hit.town, line1: raw.line1.trim(), line2: raw.line2.trim() || null, wardCode: hit.wardCode, deliveryTimeSlot: slot };
    const slots = getStrings("en").deliverySlots;
    const before = { name: o.shipToName, phone: o.phone, address: addressLine(o), slot: slots[o.deliveryTimeSlot] };
    const after = { name: next.shipToName, phone: next.phone, address: addressLine(next), slot: slots[slot] };
    const LABEL = { name: "Recipient", phone: "Phone", address: "Address", slot: "Time slot" } as const;
    const changes = (Object.keys(LABEL) as (keyof typeof LABEL)[]).filter((k) => before[k] !== after[k]);
    if (!changes.length) return { ok: true as const, changed: false };
    await tx.update(orders).set({ ...next, updatedAt: new Date() }).where(eq(orders.id, o.id));
    const detail = changes.map((k) => `${LABEL[k]}: ${before[k]} → ${after[k]}`).join(". ");
    await tx.insert(orderEvents).values({ orderId: o.id, kind: "delivery_changed", actorId: adminId, body: "Delivery details changed", data: { from: before, to: after, detail } });
    return { ok: true as const, changed: true };
  });
}

export type ResendResult = { ok: true; emailed: boolean } | { ok: false; error: string };

/**
 * Send the order confirmation or the shipping email again (PRD 4.4), with the order as it is now (a corrected address,
 * a customer who lost the first one). Each goes out under a key of its own, so Resend doesn't take it for a repeat.
 */
export async function adminResendEmail(number: string, adminId: string, kind: "confirmation" | "shipped"): Promise<ResendResult> {
  const db = getDb();
  const [o] = await db.select({ id: orders.id, state: orders.state, paidAt: orders.paidAt, trackingNumber: orders.trackingNumber }).from(orders).where(eq(orders.number, number));
  if (!o) return { ok: false, error: "That order no longer exists." };
  if (kind === "confirmation" && (!o.paidAt || o.state === "cancelled")) return { ok: false, error: o.paidAt ? "It was cancelled, so there's no confirmation to send." : "It hasn't been paid, so there's no confirmation to send." };
  if (kind === "shipped" && (!hasShipped(o.state) || !o.trackingNumber)) return { ok: false, error: "It hasn't shipped yet." };
  await db.insert(orderEvents).values({ orderId: o.id, kind: "email_resent", actorId: adminId, body: kind === "confirmation" ? "Confirmation sent again" : "Shipping email sent again", data: { email: kind } });
  const emailed = kind === "confirmation" ? await sendOrderConfirmation(o.id, { resend: true }).catch(() => false) : await sendShippedEmail(o.id, { resend: true });
  return { ok: true, emailed };
}

/** The CSV export (PRD 4.4, for the accounts): every matching order, oldest first, one row each. */
export async function ordersForCsv(f: OrderFilters): Promise<CsvValue[][]> {
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
      textCell(r.phone),
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
      textCell(r.trackingNumber),
    ]),
  ];
}
