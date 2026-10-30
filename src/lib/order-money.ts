import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { dropBoxes, inventoryHolds, orderEvents, orderItems, orders, refunds } from "@/db/schema";
import { sendEmail } from "./email";
import { orderCancelledEmail } from "./email-templates";
import type { RefundReason } from "./order-admin-rules";

/**
 * Money going back to customers (PRD 3.5, 4.4, D22). Every cancellation goes through cancelOrderCore, whoever
 * starts it: the customer from their order page, the shop from the admin, or cancelling a whole drop. Every refund
 * goes through recordRefund. Stripe isn't connected yet, so a refund is recorded as owed (no stripe_refund_id, no
 * issued_at); the payments PR issues it after the transaction commits, keyed by the refund's id, and marks it
 * issued from Stripe's webhook.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Order = typeof orders.$inferSelect;

export type CancelSource = "customer" | "admin" | "drop";
export type RefundReasonCode = "customer_cancelled" | "admin_cancelled" | "drop_cancelled" | RefundReason;
const CANCEL_REASON: Record<CancelSource, RefundReasonCode> = { customer: "customer_cancelled", admin: "admin_cancelled", drop: "drop_cancelled" };

/** What's been refunded on an order so far, owed or issued. */
export async function refundedSoFar(conn: Tx, orderId: string): Promise<number> {
  const [r] = await conn.select({ n: sql<number>`coalesce(sum(${refunds.amount}), 0)::int` }).from(refunds).where(eq(refunds.orderId, orderId));
  return r.n;
}

/**
 * Record a refund in the order's transaction. One the admin asked for also records who and why, which the timeline
 * shows on the refund (a cancellation's refund is explained by its "cancelled" event instead).
 */
export async function recordRefund(tx: Tx, r: { orderId: string; amount: number; reason: RefundReasonCode; actorId?: string; note?: string }): Promise<string> {
  const [row] = await tx.insert(refunds).values({ orderId: r.orderId, amount: r.amount, reason: r.reason }).returning({ id: refunds.id });
  if (r.actorId) await tx.insert(orderEvents).values({ orderId: r.orderId, kind: "refund", actorId: r.actorId, body: r.note ?? "", data: { refundId: row.id } });
  return row.id;
}

/**
 * Cancel one order inside the caller's transaction. The caller has locked the order and then its drop (the order a
 * customer's cancel takes them in), and checked that the order may be cancelled.
 *
 * A paid order's boxes stop counting as sold, so they're on sale again while the drop is open (or if it reopens),
 * and whatever is left of the payment is refunded. An order still awaiting payment lets go of its holds. Returns the
 * refund: null when nothing was paid, 0 when earlier refunds already returned it all.
 */
export async function cancelOrderCore(tx: Tx, o: Order, by: { source: CancelSource; actorId?: string | null; note?: string }, now = new Date()): Promise<{ refund: number | null }> {
  let refund: number | null = null;
  if (o.paidAt) {
    const items = await tx.select({ dropBoxId: orderItems.dropBoxId, qty: orderItems.qty }).from(orderItems).where(eq(orderItems.orderId, o.id));
    for (const it of items) {
      await tx.execute(sql`select id from ${dropBoxes} where id = ${it.dropBoxId} for update`);
      await tx.update(dropBoxes).set({ soldQty: sql`greatest(0, ${dropBoxes.soldQty} - ${it.qty})` }).where(eq(dropBoxes.id, it.dropBoxId));
    }
    refund = Math.max(0, o.total - (await refundedSoFar(tx, o.id)));
    if (refund > 0) await recordRefund(tx, { orderId: o.id, amount: refund, reason: CANCEL_REASON[by.source] });
  } else {
    await tx.delete(inventoryHolds).where(eq(inventoryHolds.orderId, o.id));
  }
  await tx.update(orders).set({ state: "cancelled", cancelledAt: now, updatedAt: now }).where(eq(orders.id, o.id));
  await tx.insert(orderEvents).values({ orderId: o.id, kind: "cancelled", actorId: by.actorId ?? null, body: by.note ?? "", data: { source: by.source } });
  return { refund };
}

/** The customer's cancellation email, once the cancelling transaction has committed. False if it couldn't be sent (the log says why). */
export async function sendCancellationEmail(orderId: string, opts: { refund: number | null; byShop: boolean }): Promise<boolean> {
  try {
    const o = await getDb().query.orders.findFirst({ where: eq(orders.id, orderId), columns: { id: true, number: true, total: true, locale: true, customerId: true }, with: { customer: { columns: { email: true } } } });
    if (!o) return false;
    const email = orderCancelledEmail({ locale: o.locale, number: o.number, total: o.total, refund: opts.refund, byShop: opts.byShop });
    const r = await sendEmail({ ...email, to: o.customer.email, type: "order_cancelled", idempotencyKey: `order-cancelled/${o.id}`, customerId: o.customerId, orderId: o.id });
    return r.ok;
  } catch (e) {
    console.error("cancellation email failed", e);
    return false;
  }
}
