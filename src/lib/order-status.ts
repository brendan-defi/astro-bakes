import type { DropState } from "./data";

/**
 * Customer-facing order status (PRD 2.5, 5.2b): Confirmed → Baking → Shipped →
 * Delivered, where "Baking" is derived from the drop's state, plus the side
 * exits. Pure, so it is unit tested.
 */
export type OrderState = "pending_payment" | "paid" | "packed" | "shipped" | "complete" | "expired" | "cancelled";
export type OrderStatus = "awaiting_payment" | "confirmed" | "baking" | "shipped" | "delivered" | "cancelled" | "expired";

export function orderStatus(orderState: OrderState, dropState: DropState): OrderStatus {
  switch (orderState) {
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "pending_payment":
      return "awaiting_payment";
    case "shipped":
      return "shipped";
    case "complete":
      return "delivered";
    case "paid":
    case "packed":
      return dropState === "baking" || dropState === "shipped" ? "baking" : "confirmed";
  }
}

/** Free self-serve cancellation with a full refund until the drop closes; none after (D22). */
export function canCancel(orderState: OrderState, dropState: DropState): boolean {
  return (orderState === "paid" || orderState === "pending_payment") && dropState === "open";
}
