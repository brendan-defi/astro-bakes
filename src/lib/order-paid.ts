import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { sendOrderConfirmation } from "./account";
import { sendEmail } from "./email";
import { ownerNewOrderEmail } from "./email-templates";
import { ADMIN_HOST } from "./hosts";
import { getStrings } from "./i18n";
import { ownerNotifications } from "./settings";

/**
 * Everything that follows an order being paid (PRD 3.6): the customer's
 * confirmation, and the owner's "new order" email when that's switched on
 * (Settings → Notifications). Runs after the payment has committed: today
 * straight after placeOrder's mock payment, later from Stripe's webhook.
 * Never throws: a failed send is in notification_log, and it mustn't undo a
 * paid order.
 */
export async function afterOrderPaid(orderId: string): Promise<void> {
  await Promise.all([
    sendOrderConfirmation(orderId).catch((e) => console.error("order confirmation failed", e)),
    sendOwnerNewOrder(orderId).catch((e) => console.error("owner new-order email failed", e)),
  ]);
}

async function sendOwnerNewOrder(orderId: string): Promise<void> {
  const owner = await ownerNotifications();
  if (!owner.newOrders) return;
  const o = await getDb().query.orders.findFirst({ where: eq(orders.id, orderId), with: { drop: true, items: true } });
  if (!o) return;
  const en = getStrings("en");
  const email = ownerNewOrderEmail(
    {
      number: o.number,
      dropName: o.drop.nameEn,
      lines: o.items.map((i) => ({ name: i.nameEn, qty: i.qty })),
      total: o.total,
      paymentMethod: o.paymentMethodType,
      shipToName: o.shipToName,
      ward: o.city,
      slot: en.deliverySlots[o.deliveryTimeSlot],
      giftMessage: o.giftMessage,
    },
    `https://${ADMIN_HOST}/admin`,
  );
  await sendEmail({ ...email, to: owner.to, type: "internal", idempotencyKey: `owner-new-order/${o.id}`, orderId: o.id });
}
