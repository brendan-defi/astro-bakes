import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { orderEvents, orders } from "@/db/schema";
import { orderShipDates } from "./data";
import { sendEmail } from "./email";
import { orderShippedEmail } from "./email-templates";
import { fmtDate } from "./format";
import { arrivalOffsetDays } from "./settings";
import { formatTracking, trackingUrl } from "./tracking";

/**
 * Sending orders on their way (PRD 3.7, 4.6). Marking an order shipped goes through shipOrderCore, whoever does it:
 * the admin on one order now, the Japan Post result import (4.6) for many later. The customer's "on its way" email
 * goes out after the transaction commits.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Order = typeof orders.$inferSelect;

/**
 * Mark one order shipped inside the caller's transaction, with its tracking number (digits, parseTracking). The caller
 * has locked the order, then its drop, and checked that it may ship (canShip, and the drop has closed: canPack).
 */
export async function shipOrderCore(tx: Tx, o: Order, tracking: string, actorId: string | null, now = new Date()): Promise<void> {
  await tx.update(orders).set({ state: "shipped", shippedAt: now, trackingNumber: tracking, updatedAt: now }).where(eq(orders.id, o.id));
  await tx.insert(orderEvents).values({ orderId: o.id, kind: "shipped", actorId, body: "Shipped", data: { tracking } });
}

/**
 * The customer's "on its way" email with the order's tracking number, read from what's stored. The first send has one
 * key per order, so a retried request can't send it twice; a correction (`corrected`) or the admin sending it again
 * (`resend`) gets a key of its own. False if it couldn't be sent (the log says why).
 */
export async function sendShippedEmail(orderId: string, opts: { corrected?: boolean; resend?: boolean } = {}): Promise<boolean> {
  try {
    const o = await getDb().query.orders.findFirst({ where: eq(orders.id, orderId), with: { drop: { columns: { shipAt: true } }, customer: { columns: { email: true } } } });
    if (!o?.trackingNumber) return false;
    const offset = await arrivalOffsetDays();
    // The drop's planned arrival, unless it shipped late (the same dates the order pages show).
    const arrive = orderShipDates(o.drop.shipAt, o.shippedAt, offset).arriveAt;
    const email = orderShippedEmail({
      locale: o.locale,
      order: { number: o.number, tracking: formatTracking(o.trackingNumber), trackingUrl: trackingUrl(o.trackingNumber, o.locale), arriveDate: fmtDate(arrive, o.locale), timeSlot: o.deliveryTimeSlot, corrected: opts.corrected },
    });
    const once = `order-shipped/${o.id}`;
    const idempotencyKey = opts.corrected || opts.resend ? `${once}/${o.trackingNumber}/${opts.corrected ? "corrected" : "resend"}-${Date.now()}` : once;
    const r = await sendEmail({ ...email, to: o.customer.email, type: "shipped", idempotencyKey, customerId: o.customerId, orderId: o.id });
    return r.ok;
  } catch (e) {
    console.error("shipped email failed", e);
    return false;
  }
}
