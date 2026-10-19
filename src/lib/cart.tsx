"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { boxes, drop, settings, type Box } from "./data";

type Quantities = Record<string, number>;

export interface CartLine {
  box: Box;
  qty: number;
  lineTotal: number | null;
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
const STORAGE_KEY = `ab-cart:${drop.id}`;

export function maxFor(box: Box): number {
  return Math.min(box.left, box.maxPerCustomer);
}

export function CartProvider({ children, initial }: { children: ReactNode; initial?: Quantities }) {
  const [qty, setQty] = useState<Quantities>(initial ?? {});
  const [hydrated, setHydrated] = useState(false);

  // Cart is client-side until sign-in (PRD 3.3); persist per drop.
  useEffect(() => {
    try {
      // ?demo=cart / ?demo=soldout seed a sample cart for local mockup screenshots.
      const demo = new URLSearchParams(window.location.search).get("demo");
      if (demo === "cart") setQty({ cookie: 1, loaf: 1 });
      else if (demo === "soldout") setQty({ cookie: 3, loaf: 1 });
      else {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw && !initial) setQty(JSON.parse(raw));
      }
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(qty));
    } catch {}
  }, [qty, hydrated]);

  const set = useCallback((id: string, n: number) => {
    const box = boxes.find((b) => b.id === id);
    if (!box) return;
    const clamped = Math.max(0, Math.min(maxFor(box), Math.floor(n)));
    setQty((q) => (q[id] === clamped ? q : { ...q, [id]: clamped }));
  }, []);

  const inc = useCallback((id: string) => setQty((q) => {
    const box = boxes.find((b) => b.id === id);
    if (!box) return q;
    return { ...q, [id]: Math.min(maxFor(box), (q[id] ?? 0) + 1) };
  }), []);

  const dec = useCallback((id: string) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) - 1) })), []);
  const clear = useCallback(() => setQty({}), []);

  const value = useMemo<CartValue>(() => {
    const lines: CartLine[] = boxes
      .filter((b) => (qty[b.id] ?? 0) > 0)
      .map((b) => ({ box: b, qty: qty[b.id], lineTotal: b.price == null ? null : b.price * qty[b.id] }));
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const subtotal = lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
    const shippingFee = settings.shippingFee;
    const total = shippingFee == null || count === 0 ? null : subtotal + shippingFee;
    return { qty, set, inc, dec, clear, lines, count, subtotal, shippingFee, total, hydrated };
  }, [qty, set, inc, dec, clear, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const v = useContext(CartContext);
  if (!v) throw new Error("useCart must be used inside <CartProvider>");
  return v;
}
