import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { addresses, customers, drops, orders } from "@/db/schema";
import { addressLine } from "./address";
import { arrivalDate, effectiveState, type Box, type Locale } from "./data";
import { validateDelivery, type DeliveryInput } from "./checkout-rules";
import { sendEmail } from "./email";
import { orderConfirmationEmail, type OrderEmailData } from "./email-templates";
import { fmtDate, fmtDateTime } from "./format";
import { cancelOrderCore, sendCancellationEmail } from "./order-money";
import { canCancel, canChangeSlot, orderStatus, type OrderStatus } from "./order-status";
import { isDeliverySlot, type DeliverySlot } from "./delivery-slots";
import { loadDrops } from "./drops";
import { arrivalOffsetDays } from "./settings";

/**
 * The account area (PRD 2.3–2.6, 3.8, D22): profile and saved address,
 * notification preference, order history, cancellation while the drop is
 * open, and the order emails. Server only; everything is scoped to the
 * signed-in customer's id.
 */

// Arrival only decides shipped vs complete (a few days later), which nothing here depends on; the default offset will do.
const liveState = (d: { state: Drops["state"]; openAt: Date; closeAt: Date; shipAt: Date }, now = new Date()) =>
  effectiveState({ ...d, arriveAt: arrivalDate(d.shipAt) }, now);
type Drops = typeof drops.$inferSelect;

// ---------------------------------------------------------------- orders

export interface OrderLine {
  name: string;
  slug: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderSummary {
  number: string;
  placedAt: Date;
  dropName: string;
  status: OrderStatus;
  total: number;
  lines: OrderLine[];
  canCancel: boolean;
}

export interface OrderDetail extends OrderSummary {
  dropSlug: string;
  shipToName: string;
  phone: string;
  addressLine: string;
  subtotal: number;
  shippingFee: number;
  giftMessage: string | null;
  /** Delivery time slot (D21), changeable while `canChangeSlot`. */
  timeSlot: DeliverySlot;
  canChangeSlot: boolean;
  paymentMethod: "card" | "paypay" | null;
  trackingNumber: string | null;
  shipAt: Date;
  arriveAt: Date;
  closeAt: Date;
  refund: { amount: number; issued: boolean } | null;
  /** The same boxes in the currently open drop, when there is one (PRD 2.5 "Order again"), with that drop's boxes for clamping. */
  reorder: { dropId: string; items: Record<string, number>; boxes: Box[] } | null;
}


function toSummary(o: typeof orders.$inferSelect & { drop: Drops; items: { nameEn: string; nameJa: string | null; qty: number; unitPrice: number; box: { slug: string } }[] }, locale: Locale, now: Date): OrderSummary {
  const dropState = liveState(o.drop, now);
  return {
    number: o.number,
    placedAt: o.createdAt,
    dropName: (locale === "ja" && o.drop.nameJa) || o.drop.nameEn,
    status: orderStatus(o.state, dropState),
    total: o.total,
    lines: o.items.map((i) => ({ name: (locale === "ja" && i.nameJa) || i.nameEn, slug: i.box.slug, qty: i.qty, unitPrice: i.unitPrice, lineTotal: i.qty * i.unitPrice })),
    canCancel: canCancel(o.state, dropState),
  };
}

const withItems = { drop: true, items: { with: { box: { columns: { slug: true } } } } } as const;

/** Newest first (PRD 2.5). */
export async function loadOrders(customerId: string, locale: Locale): Promise<OrderSummary[]> {
  const rows = await getDb().query.orders.findMany({ where: eq(orders.customerId, customerId), orderBy: [desc(orders.createdAt)], with: withItems });
  const now = new Date();
  return rows.map((o) => toSummary(o, locale, now));
}

/** `excludeCartId` is the viewer's own checkout cookie, so "order again" isn't clamped by their own reservation (same as the homepage and checkout). */
export async function loadOrder(customerId: string, number: string, locale: Locale, excludeCartId: string | null = null): Promise<OrderDetail | null> {
  const o = await getDb().query.orders.findFirst({ where: and(eq(orders.customerId, customerId), eq(orders.number, number)), with: { ...withItems, refunds: true } });
  if (!o) return null;
  const now = new Date();
  const summary = toSummary(o, locale, now);
  // "Order again": the same boxes in whatever drop is open right now, if it carries them all.
  const [allDrops, offset] = await Promise.all([loadDrops(locale, excludeCartId), arrivalOffsetDays()]);
  const open = allDrops.find((d) => effectiveState(d, now) === "open") ?? null;
  const onSale = open ? new Set(open.boxes.map((b) => b.id)) : null;
  const reorder = open && onSale && summary.lines.every((l) => onSale.has(l.slug)) ? { dropId: open.id, items: Object.fromEntries(summary.lines.map((l) => [l.slug, l.qty])), boxes: open.boxes } : null;
  // Every refund together: a cancellation's, and any the shop made by hand (damage, non-delivery).
  const refund = o.refunds.length ? { amount: o.refunds.reduce((n, r) => n + r.amount, 0), issued: o.refunds.every((r) => r.issuedAt) } : null;
  return {
    ...summary,
    dropSlug: o.drop.slug,
    shipToName: o.shipToName,
    phone: o.phone,
    addressLine: addressLine(o),
    subtotal: o.subtotal,
    shippingFee: o.shippingFee,
    giftMessage: o.giftMessage,
    timeSlot: o.deliveryTimeSlot,
    canChangeSlot: canChangeSlot(o.state, liveState(o.drop, now)),
    paymentMethod: o.paymentMethodType,
    trackingNumber: o.trackingNumber,
    shipAt: o.drop.shipAt,
    arriveAt: arrivalDate(o.drop.shipAt, offset),
    closeAt: o.drop.closeAt,
    refund,
    reorder,
  };
}

// ---------------------------------------------------------------- cancel (D22)

export type CancelResult = { ok: true; refunded: boolean } | { ok: false; error: "not_found" | "closed" | "not_cancellable" };

/** Self-serve cancellation: the rest of the payment refunded (owed until Stripe), stock returned, email sent. Only while the drop is open. */
export async function cancelOrder(customerId: string, number: string): Promise<CancelResult> {
  const result = await getDb().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.customerId, customerId), eq(orders.number, number))).for("update");
    if (!o) return { ok: false as const, error: "not_found" as const };
    const [drop] = await tx.select().from(drops).where(eq(drops.id, o.dropId)).for("update");
    const dropState = liveState(drop);
    if (!canCancel(o.state, dropState)) return { ok: false as const, error: dropState === "open" ? ("not_cancellable" as const) : ("closed" as const) };
    const { refund } = await cancelOrderCore(tx, o, { source: "customer" });
    return { ok: true as const, refund, orderId: o.id };
  });
  if (!result.ok) return result;
  await sendCancellationEmail(result.orderId, { refund: result.refund, byShop: false });
  return { ok: true, refunded: result.refund !== null };
}

// ---------------------------------------------------------------- delivery time slot (D21)

/** `changed` is false when the order already had that slot, so callers can skip revalidating. */
export type SlotResult = { ok: true; slot: DeliverySlot; changed: boolean } | { ok: false; error: "invalid" | "not_found" | "closed" | "not_changeable" };

/** Change an order's delivery time slot. Same window as free cancellation (until the drop closes), same lock order as cancelOrder. */
export async function changeTimeSlot(customerId: string, number: string, slot: unknown): Promise<SlotResult> {
  if (!isDeliverySlot(slot)) return { ok: false, error: "invalid" };
  return getDb().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.customerId, customerId), eq(orders.number, number))).for("update");
    if (!o) return { ok: false as const, error: "not_found" as const };
    const [drop] = await tx.select().from(drops).where(eq(drops.id, o.dropId)).for("update");
    const dropState = liveState(drop);
    if (!canChangeSlot(o.state, dropState)) return { ok: false as const, error: dropState === "open" ? ("not_changeable" as const) : ("closed" as const) };
    const changed = o.deliveryTimeSlot !== slot;
    if (changed) await tx.update(orders).set({ deliveryTimeSlot: slot, updatedAt: new Date() }).where(eq(orders.id, o.id));
    return { ok: true as const, slot, changed };
  });
}

// ---------------------------------------------------------------- confirmation email (PRD 3.6)

/** Sent once an order is paid; called after the placing transaction commits (and from the Stripe webhook later). */
export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const o = await getDb().query.orders.findFirst({ where: eq(orders.id, orderId), with: { ...withItems, customer: { columns: { email: true } } } });
  if (!o) return;
  const locale = o.locale;
  const offset = await arrivalOffsetDays();
  const data: OrderEmailData = {
    number: o.number,
    lines: o.items.map((i) => ({ name: (locale === "ja" && i.nameJa) || i.nameEn, qty: i.qty, lineTotal: i.qty * i.unitPrice })),
    subtotal: o.subtotal,
    shippingFee: o.shippingFee,
    total: o.total,
    shipToName: o.shipToName,
    addressLine: addressLine(o),
    shipDate: fmtDate(o.drop.shipAt, locale),
    arriveDate: fmtDate(arrivalDate(o.drop.shipAt, offset), locale),
    closeDateTime: fmtDateTime(o.drop.closeAt, locale),
    giftMessage: o.giftMessage,
    timeSlot: o.deliveryTimeSlot,
  };
  await sendEmail({ ...orderConfirmationEmail({ locale, order: data }), to: o.customer.email, type: "order_confirmation", idempotencyKey: `order-confirmation/${o.id}`, customerId: o.customerId, orderId: o.id });
}

// ---------------------------------------------------------------- profile (PRD 2.3, 2.4, 2.6)

export interface ProfileInput {
  name: string;
  phone: string;
  locale: Locale;
  address: DeliveryInput;
}

export type ProfileResult = { ok: true } | { ok: false; error: "invalid"; errors: string[] };

export async function updateProfile(customerId: string, input: ProfileInput): Promise<ProfileResult> {
  const delivery = validateDelivery({ ...input.address, name: input.name, phone: input.phone });
  if (!delivery.ok || !delivery.hit) return { ok: false, error: "invalid", errors: delivery.errors };
  const hit = delivery.hit;
  const now = new Date();
  const locale: Locale = input.locale === "ja" ? "ja" : "en";
  await getDb().transaction(async (tx) => {
    await tx.update(customers).set({ name: input.name.trim(), phone: delivery.phone, locale, updatedAt: now }).where(eq(customers.id, customerId));
    const saved = { customerId, postalCode: delivery.postal, prefecture: hit.prefecture, city: hit.city, town: hit.town, line1: input.address.line1.trim(), line2: input.address.line2?.trim() || null, wardCode: hit.wardCode };
    await tx.insert(addresses).values(saved).onConflictDoUpdate({ target: addresses.customerId, set: { ...saved, updatedAt: now } });
  });
  return { ok: true };
}

/** "Email me when a drop is announced or opens" (PRD 2.4). */
export async function setMarketingOptIn(customerId: string, optIn: boolean): Promise<void> {
  await getDb().update(customers).set({ marketingOptIn: optIn, updatedAt: new Date() }).where(eq(customers.id, customerId));
}

