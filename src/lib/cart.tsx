"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { Box } from "./data";
import { demoEnabled } from "./demo";
import { readStored, useHydrated, useStored, writeStored } from "./stored";

export type Quantities = Record<string, number>;

export interface CartLine {
  box: Box;
  qty: number;
  lineTotal: number;
}

interface CartValue {
  qty: Quantities;
  /** The boxes on sale in this cart's drop. */
  boxes: Box[];
  /** Set a box's quantity, clamped to [0, min(left, maxPerCustomer)]. */
  set: (id: string, n: number) => void;
  inc: (id: string) => void;
  dec: (id: string) => void;
  clear: () => void;
  lines: CartLine[];
  count: number;
  subtotal: number;
  shippingFee: number | null;
  total: number | null;
  /** True once this drop's saved cart has been read on the client. */
  hydrated: boolean;
}

/** What the provider shares: which drop, and its boxes and fee. None of it changes at hydration; the saved cart is read by useCart. */
interface CartScope {
  dropId: string;
  boxes: Box[];
  shippingFee: number | null;
}

const CartContext = createContext<CartScope | null>(null);

export function maxFor(box: Box): number {
  return Math.min(box.left, box.maxPerCustomer);
}

export function storageKey(dropId: string): string {
  return `ab-cart:${dropId}`;
}

/** Keep only boxes in this drop, clamped to what can still be bought (D5, D7). Unknown ids and junk are dropped. */
export function sanitize(qty: Quantities, boxes: Box[]): Quantities {
  const out: Quantities = {};
  for (const box of boxes) {
    const n = Math.min(maxFor(box), Math.floor(Number(qty[box.id] ?? 0)));
    if (Number.isFinite(n) && n > 0) out[box.id] = n;
  }
  return out;
}

/** Add quantities to a saved cart ("Order again", PRD 2.5), clamped to what can still be bought; nothing already there is lost. */
export function mergeQuantities(existing: Quantities, add: Quantities, boxes: Box[]): Quantities {
  const merged: Quantities = { ...sanitize(existing, boxes) };
  for (const [id, n] of Object.entries(add)) merged[id] = (merged[id] ?? 0) + n;
  return sanitize(merged, boxes);
}

/** A saved cart as stored; anything unreadable counts as empty. */
function parseQuantities(raw: string | null): Quantities {
  if (!raw) return {};
  try {
    const q: unknown = JSON.parse(raw);
    return q && typeof q === "object" ? (q as Quantities) : {};
  } catch {
    return {};
  }
}

/** "Order again" from the account page, where no cart is on show: add to the drop's saved cart. */
export function addToSavedCart(dropId: string, add: Quantities, boxes: Box[]) {
  const key = storageKey(dropId);
  writeStored("local", key, JSON.stringify(mergeQuantities(parseQuantities(readStored("local", key)), add, boxes)));
}

/** ?demo=cart / ?demo=soldout sample carts; development and previews only (see demo.ts). */
const DEMO_CARTS: Record<string, Quantities> = {
  cart: { "cookie-box": 1, "banana-bread": 1 },
  soldout: { "cookie-box": 3, "banana-bread": 1 },
};

interface ProviderProps {
  children: ReactNode;
  /** The drop this cart is for; the cart is stored per drop (PRD 3.3). */
  dropId: string;
  /** Boxes on sale in that drop: prices, remaining stock and per-customer limits for clamping. */
  boxes: Box[];
  shippingFee: number | null;
}

/**
 * The cart is the drop's localStorage entry (client-side until sign-in, PRD 3.3), read straight from there rather
 * than copied into state: every tab showing the drop sees the same cart, and switching drops reads the other entry.
 */
export function CartProvider({ children, dropId, boxes, shippingFee }: ProviderProps) {
  const key = storageKey(dropId);
  // Only to re-check the saved cart below. It never reaches the context, so the switch from the server's empty
  // cart to the saved one can't push an update into a part of the page that's still hydrating (a Suspense boundary).
  const raw = useStored("local", key);
  const scope = useMemo(() => ({ dropId, boxes, shippingFee }), [dropId, boxes, shippingFee]);

  // A ?demo= sample cart replaces the saved one whenever a drop's cart loads.
  useEffect(() => {
    const demo = demoEnabled ? new URLSearchParams(window.location.search).get("demo") : null;
    if (demo && DEMO_CARTS[demo]) writeStored("local", key, JSON.stringify(DEMO_CARTS[demo]));
  }, [key]);

  // Save the cart back clamped to this drop's stock, so a box that sold out stays out even if stock frees up later.
  useEffect(() => {
    const saved = readStored("local", key);
    if (saved === null) return;
    const clamped = JSON.stringify(sanitize(parseQuantities(saved), boxes));
    if (saved !== clamped) writeStored("local", key, clamped);
  }, [key, raw, boxes]);

  return <CartContext.Provider value={scope}>{children}</CartContext.Provider>;
}

/** The cart, read from storage where it's used, so each part of the page switches to it once that part has hydrated. */
export function useCart(): CartValue {
  const scope = useContext(CartContext);
  if (!scope) throw new Error("useCart must be used inside <CartProvider>");
  const { dropId, boxes, shippingFee } = scope;
  const key = storageKey(dropId);
  const raw = useStored("local", key);
  const hydrated = useHydrated();
  const qty = useMemo(() => sanitize(parseQuantities(raw), boxes), [raw, boxes]);

  // Read-modify-write on storage, so several changes in one event build on each other.
  const update = useCallback((fn: (q: Quantities) => Quantities) => {
    const current = sanitize(parseQuantities(readStored("local", key)), boxes);
    const next = fn(current);
    if (next !== current) writeStored("local", key, JSON.stringify(sanitize(next, boxes)));
  }, [key, boxes]);

  const set = useCallback((id: string, n: number) => {
    const box = boxes.find((b) => b.id === id);
    if (!box) return;
    const clamped = Math.max(0, Math.min(maxFor(box), Math.floor(n)));
    update((q) => (q[id] === clamped ? q : { ...q, [id]: clamped }));
  }, [boxes, update]);

  const inc = useCallback((id: string) => {
    const box = boxes.find((b) => b.id === id);
    if (!box) return;
    update((q) => {
      const next = Math.min(maxFor(box), (q[id] ?? 0) + 1);
      return q[id] === next ? q : { ...q, [id]: next };
    });
  }, [boxes, update]);

  const dec = useCallback((id: string) => {
    update((q) => (id in q ? { ...q, [id]: Math.max(0, q[id] - 1) } : q));
  }, [update]);

  const clear = useCallback(() => update(() => ({})), [update]);

  return useMemo<CartValue>(() => {
    const lines: CartLine[] = boxes
      .filter((b) => (qty[b.id] ?? 0) > 0)
      .map((b) => ({ box: b, qty: qty[b.id], lineTotal: b.price * qty[b.id] }));
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const total = shippingFee == null || count === 0 ? null : subtotal + shippingFee;
    return { qty, boxes, set, inc, dec, clear, lines, count, subtotal, shippingFee, total, hydrated };
  }, [qty, hydrated, set, inc, dec, clear, boxes, shippingFee]);
}
