/**
 * Delivery time slots (PRD D21, 2026-10-20): the date is the drop's ship date + 1, the customer picks
 * the time. These are Japan Post ゆうパック's slots (the 20–21 slot was withdrawn in October 2024).
 * No imports on purpose: the schema, the server and client components all read this.
 */

export const DELIVERY_SLOTS = ["none", "morning", "12_14", "14_16", "16_18", "18_20", "19_21"] as const;
export type DeliverySlot = (typeof DELIVERY_SLOTS)[number];

export function isDeliverySlot(x: unknown): x is DeliverySlot {
  return typeof x === "string" && (DELIVERY_SLOTS as readonly string[]).includes(x);
}

/** 配達希望時間帯 in Japan Post's label tools (Webゆうパックプリント, ゆうプリR): 00 希望なし, 51 午前中 … 57 19–21. There is no 56. */
const JAPAN_POST_CODES: Record<DeliverySlot, "00" | "51" | "52" | "53" | "54" | "55" | "57"> = {
  none: "00",
  morning: "51",
  "12_14": "52",
  "14_16": "53",
  "16_18": "54",
  "18_20": "55",
  "19_21": "57",
};

export function japanPostSlotCode(slot: DeliverySlot): (typeof JAPAN_POST_CODES)[DeliverySlot] {
  return JAPAN_POST_CODES[slot];
}
