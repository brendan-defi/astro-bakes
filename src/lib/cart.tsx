"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Box } from "./data";
import { demoEnabled } from "./demo";

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

const CartContext = createContext<CartValue | null>(null);

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
  /** Seed for the first render; wins over anything saved. */
  initial?: Quantities;
}

/** The quantities are tagged with the drop they were loaded for, so a drop switch can never persist one drop's cart under another's key. */
interface CartState {
  dropId: string;
  qty: Quantities;
  hydrated: boolean;
}

export function CartProvider({ children, dropId, boxes, shippingFee, initial }: ProviderProps) {
  const [state, setState] = useState<CartState>({ dropId, qty: initial ?? {}, hydrated: false });
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;

  // Load this drop's cart on mount and again whenever the drop changes (client-side until sign-in, PRD 3.3).
  useEffect(() => {
    let qty: Quantities = initial ?? {};
    try {
      const demo = demoEnabled ? new URLSearchParams(window.location.search).get("demo") : null;
      if (demo && DEMO_CARTS[demo]) qty = DEMO_CARTS[demo];
      else if (!initial) {
        const raw = window.localStorage.getItem(storageKey(dropId));
        if (raw) qty = JSON.parse(raw) as Quantities;
      }
    } catch {}
    setState({ dropId, qty: sanitize(qty, boxesRef.current), hydrated: true });
    // `initial` only seeds the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropId]);

  // Persist, but only a cart that was loaded for the drop currently on show.
  const current = state.hydrated && state.dropId === dropId;
  useEffect(() => {
    if (!current) return;
    try {
      window.localStorage.setItem(storageKey(dropId), JSON.stringify(state.qty));
    } catch {}
  }, [current, dropId, state.qty]);

  const update = useCallback((fn: (q: Quantities) => Quantities) => {
    setState((s) => {
      const qty = fn(s.qty);
      return qty === s.qty ? s : { ...s, qty };
    });
  }, []);

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

  const value = useMemo<CartValue>(() => {
    // While a different drop's cart is still in state, expose an empty one rather than a stale one.
    const qty = state.dropId === dropId ? state.qty : {};
    const lines: CartLine[] = boxes
      .filter((b) => (qty[b.id] ?? 0) > 0)
      .map((b) => ({ box: b, qty: qty[b.id], lineTotal: b.price * qty[b.id] }));
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const total = shippingFee == null || count === 0 ? null : subtotal + shippingFee;
    return { qty, boxes, set, inc, dec, clear, lines, count, subtotal, shippingFee, total, hydrated: current };
  }, [state, dropId, current, set, inc, dec, clear, boxes, shippingFee]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const v = useContext(CartContext);
  if (!v) throw new Error("useCart must be used inside <CartProvider>");
  return v;
}
