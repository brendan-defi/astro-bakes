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

/** A reference to one exact reservation, carried through the sign-in return path so a new tab can pick it up. */
export interface ReservationRef {
  checkoutId: string;
  revision: number;
}

export function formatReservationRef(r: ReservationRef): string {
  return `${r.checkoutId}:${r.revision}`;
}

export function parseReservationRef(v: string | null | undefined): ReservationRef | null {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{1,9})$/i.exec(v ?? "");
  return m ? { checkoutId: m[1], revision: Number(m[2]) } : null;
}

export type ReservationStatus =
  /** Nothing is reserved for this browser: expired, consumed, or never started. */
  | "none"
  /** This tab reserved exactly what the server holds. */
  | "ok"
  /** This tab didn't reserve it, but the sign-in link named exactly this reservation: pick it up. */
  | "adopt"
  /** The browser's reservation was taken or replaced by another tab; this tab must review the cart. */
  | "stale";

export function reservationStatus(tab: Hold | null, server: Reservation | null, ref?: ReservationRef | null): ReservationStatus {
  if (!server) return "none";
  if (tab?.checkoutId === server.checkoutId && tab?.revision === server.revision) return "ok";
  if (ref && ref.checkoutId === server.checkoutId && ref.revision === server.revision) return "adopt";
  return "stale";
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
