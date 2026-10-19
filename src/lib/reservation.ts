import type { Box } from "./data";
import type { Hold } from "./hold";

/**
 * What the browser has reserved on the server (one cart per browser, via the
 * cookie) versus what this tab reserved (sessionStorage). The checkout steps
 * show and submit the reservation, never the editable cart in localStorage.
 */
export interface Reservation {
  checkoutId: string;
  revision: number;
  expiresAt: number;
  items: Record<string, number>;
}

export type ReservationStatus =
  /** Nothing is reserved for this browser: expired, consumed, or never started. */
  | "none"
  /** This tab reserved exactly what the server holds. */
  | "ok"
  /** The browser's reservation was taken or replaced by another tab; this tab must review the cart. */
  | "stale";

export function reservationStatus(tab: Hold | null, server: Reservation | null): ReservationStatus {
  if (!server) return "none";
  if (!tab?.checkoutId) return "stale";
  return tab.checkoutId === server.checkoutId && tab.revision === server.revision ? "ok" : "stale";
}

export interface ReservedLine {
  box: Box;
  qty: number;
  lineTotal: number;
}

/** Price the reserved quantities with the drop's boxes, in box order; boxes no longer on sale are skipped. */
export function reservedLines(items: Record<string, number>, boxes: Box[]): ReservedLine[] {
  return boxes.filter((b) => (items[b.id] ?? 0) > 0).map((b) => ({ box: b, qty: items[b.id], lineTotal: b.price * items[b.id] }));
}

export function totals(lines: ReservedLine[], shippingFee: number | null) {
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + l.lineTotal, 0);
  const total = shippingFee == null || count === 0 ? null : subtotal + shippingFee;
  return { count, subtotal, total };
}
