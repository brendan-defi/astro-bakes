import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { dropBoxes, inventoryHolds, orderEvents, orderItems, orders, refunds } from "@/db/schema";
import { sendEmail } from "./email";
import { orderCancelledEmail, type CancelledRefund } from "./email-templates";
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
const CANCEL_REASONS = new Set<string>(Object.values(CANCEL_REASON));

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

/**
 * The customer's cancellation email, once the cancelling transaction has committed. Everything it says comes from
 * what's stored, so it reads the same however late it goes out: who cancelled (the "cancelled" event), and the money
 * (the cancellation's own refund, or the earlier refunds that already cover the payment, issued or still owed).
 * False if it couldn't be sent (the log says why).
 */
export async function sendCancellationEmail(orderId: string): Promise<boolean> {
  try {
    const o = await getDb().query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { id: true, number: true, total: true, locale: true, customerId: true, paidAt: true },
      with: { customer: { columns: { email: true } }, refunds: { columns: { amount: true, reason: true, issuedAt: true } }, events: { where: eq(orderEvents.kind, "cancelled"), columns: { data: true } } },
    });
    if (!o) return false;
    const now = o.refunds.find((r) => CANCEL_REASONS.has(r.reason));
    const earlier = o.refunds.filter((r) => r !== now);
    const refund: CancelledRefund = !o.paidAt ? { kind: "none" } : now ? { kind: "now", amount: now.amount } : { kind: "covered", issued: earlier.every((r) => r.issuedAt) };
    const source = (o.events[0]?.data as { source?: string } | undefined)?.source;
    const email = orderCancelledEmail({ locale: o.locale, number: o.number, total: o.total, refund, byShop: source === "admin" || source === "drop" });
    const r = await sendEmail({ ...email, to: o.customer.email, type: "order_cancelled", idempotencyKey: `order-cancelled/${o.id}`, customerId: o.customerId, orderId: o.id });
    return r.ok;
  } catch (e) {
    console.error("cancellation email failed", e);
    return false;
  }
}

/**
 * The orders a cancelled drop still owes a cancellation email: cancelled with the drop (their "cancelled" event,
 * written in the cancelling transaction, is the record of the work), and with no successful send logged. That covers
 * a send that failed and one that never happened because the request died partway through the list.
 */
export async function dropEmailsOwed(dropId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.dropId, dropId),
        eq(orders.state, "cancelled"),
        // The outer column is named with its table: in raw sql Drizzle can write ${orders.id} as a bare "id" (orders-admin.ts).
        sql`exists (select 1 from order_events e where e.order_id = "orders"."id" and e.kind = 'cancelled' and e.data->>'source' = 'drop')`,
        sql`not exists (select 1 from notification_log n where n.order_id = "orders"."id" and n.type = 'order_cancelled' and n.error is null)`,
      ),
    )
    .orderBy(asc(orders.createdAt));
  return rows.map((r) => r.id);
}

/** Emails go one at a time, this far apart, to stay under Resend's rate limit (a few a second). */
const DROP_EMAIL_GAP_MS = 600;

/**
 * Send a cancelled drop's owed cancellation emails, one at a time. Safe to run again: it only sends what's still owed,
 * and the per-order idempotency key stops Resend delivering twice if a send went through but its log row didn't.
 */
export async function sendDropCancellationEmails(dropId: string, gapMs = DROP_EMAIL_GAP_MS): Promise<{ emailed: number; emailFailed: number }> {
  const owed = await dropEmailsOwed(dropId);
  let emailed = 0;
  for (const [i, id] of owed.entries()) {
    if (i && gapMs) await new Promise((done) => setTimeout(done, gapMs));
    if (await sendCancellationEmail(id)) emailed++;
  }
  return { emailed, emailFailed: owed.length - emailed };
}
