"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Box } from "./data";
import { demoEnabled } from "./demo";

type Quantities = Record<string, number>;

export interface CartLine {
  box: Box;
  qty: number;
  lineTotal: number;
}

interface CartValue {
  qty: Quantities;
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
  hydrated: boolean;
}

const CartContext = createContext<CartValue | null>(null);

export function maxFor(box: Box): number {
  return Math.min(box.left, box.maxPerCustomer);
}

interface ProviderProps {
  children: ReactNode;
  /** The drop this cart is for; the cart is stored per drop (PRD 3.3). */
  dropId: string;
  /** Boxes on sale in that drop: prices, remaining stock and per-customer limits for clamping. */
  boxes: Box[];
  shippingFee: number | null;
  initial?: Quantities;
}

export function CartProvider({ children, dropId, boxes, shippingFee, initial }: ProviderProps) {
  const STORAGE_KEY = `ab-cart:${dropId}`;
  const [qty, setQty] = useState<Quantities>(initial ?? {});
  const [hydrated, setHydrated] = useState(false);

  // Cart is client-side until sign-in (PRD 3.3); persist per drop.
  useEffect(() => {
    try {
      // ?demo=cart / ?demo=soldout seed a sample cart; development and previews only.
      const demo = demoEnabled ? new URLSearchParams(window.location.search).get("demo") : null;
      if (demo === "cart") setQty({ "cookie-box": 1, "banana-bread": 1 });
      else if (demo === "soldout") setQty({ "cookie-box": 3, "banana-bread": 1 });
      else {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw && !initial) setQty(JSON.parse(raw));
      }
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [STORAGE_KEY]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(qty));
    } catch {}
  }, [qty, hydrated, STORAGE_KEY]);

  const set = useCallback((id: string, n: number) => {
    const box = boxes.find((b) => b.id === id);
    if (!box) return;
    const clamped = Math.max(0, Math.min(maxFor(box), Math.floor(n)));
    setQty((q) => (q[id] === clamped ? q : { ...q, [id]: clamped }));
  }, [boxes]);

  const inc = useCallback((id: string) => setQty((q) => {
    const box = boxes.find((b) => b.id === id);
    if (!box) return q;
    return { ...q, [id]: Math.min(maxFor(box), (q[id] ?? 0) + 1) };
  }), [boxes]);

  const dec = useCallback((id: string) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) - 1) })), []);
  const clear = useCallback(() => setQty({}), []);

  const value = useMemo<CartValue>(() => {
    const lines: CartLine[] = boxes
      .filter((b) => (qty[b.id] ?? 0) > 0)
      .map((b) => ({ box: b, qty: qty[b.id], lineTotal: b.price * qty[b.id] }));
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const total = shippingFee == null || count === 0 ? null : subtotal + shippingFee;
    return { qty, set, inc, dec, clear, lines, count, subtotal, shippingFee, total, hydrated };
  }, [qty, set, inc, dec, clear, hydrated, boxes, shippingFee]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const v = useContext(CartContext);
  if (!v) throw new Error("useCart must be used inside <CartProvider>");
  return v;
}
