import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { CartProvider, maxFor, sanitize, storageKey, useCart } from "./cart";
import type { Box } from "./data";

const box = (over: Partial<Box> & { id: string }): Box => ({
  name: over.id, desc: "", contents: "", allergens: [], price: 1000, left: 10, maxPerCustomer: 5, tint: "", tilt: "", ...over,
});
const cookie = box({ id: "cookie-box", price: 1000, left: 7 });
const loaf = box({ id: "banana-bread", price: 500, left: 3 });
const soldOut = box({ id: "sampler-box", price: 900, left: 0 });
const boxes = [cookie, loaf, soldOut];

type Props = { dropId: string; boxes: Box[]; shippingFee: number | null; initial?: Record<string, number> };
/** A wrapper whose props can change between rerenders, so the provider updates without remounting. */
function mount(props: Props) {
  let current = props;
  const Wrapper = ({ children }: { children: ReactNode }) => <CartProvider {...current}>{children}</CartProvider>;
  const hook = renderHook(() => useCart(), { wrapper: Wrapper });
  return { ...hook, update: (next: Partial<Props>) => { current = { ...current, ...next }; hook.rerender(); } };
}
const saved = (dropId: string) => JSON.parse(window.localStorage.getItem(storageKey(dropId)) ?? "null");

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("maxFor / sanitize", () => {
  it("caps at the lower of remaining stock and the per-customer limit", () => {
    expect(maxFor(cookie)).toBe(5);
    expect(maxFor(loaf)).toBe(3);
    expect(maxFor(soldOut)).toBe(0);
  });

  it("drops unknown ids and junk, clamps the rest", () => {
    expect(sanitize({ "cookie-box": 9, "banana-bread": 2, "sampler-box": 1, ghost: 4, bad: Number.NaN }, boxes)).toEqual({ "cookie-box": 5, "banana-bread": 2 });
  });
});

describe("CartProvider", () => {
  it("clamps quantities to the injected stock and limits", () => {
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    act(() => { for (let i = 0; i < 10; i++) result.current.inc("cookie-box"); });
    expect(result.current.qty["cookie-box"]).toBe(5);
    act(() => { for (let i = 0; i < 10; i++) result.current.inc("banana-bread"); });
    expect(result.current.qty["banana-bread"]).toBe(3);
    act(() => result.current.inc("sampler-box"));
    act(() => result.current.inc("not-a-box"));
    expect(result.current.lines.map((l) => l.box.id)).toEqual(["cookie-box", "banana-bread"]);
    act(() => result.current.set("cookie-box", 2));
    act(() => result.current.dec("banana-bread"));
    expect(result.current.qty).toMatchObject({ "cookie-box": 2, "banana-bread": 2 });
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("prices lines and totals from the injected boxes and shipping fee", () => {
    const { result, update } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    act(() => { result.current.set("cookie-box", 2); result.current.set("banana-bread", 1); });
    expect(result.current.count).toBe(3);
    expect(result.current.subtotal).toBe(2500);
    expect(result.current.total).toBe(3300);
    update({ boxes: [box({ id: "cookie-box", price: 1200, left: 7 }), loaf], shippingFee: null });
    expect(result.current.lines[0].lineTotal).toBe(2400);
    expect(result.current.total).toBeNull();
  });

  it("restores the saved cart for the drop, sanitised, and persists changes", () => {
    window.localStorage.setItem(storageKey("drop-03"), JSON.stringify({ "cookie-box": 2, "banana-bread": 9, ghost: 4 }));
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    expect(result.current.hydrated).toBe(true);
    expect(result.current.qty).toEqual({ "cookie-box": 2, "banana-bread": 3 });
    act(() => result.current.inc("cookie-box"));
    expect(saved("drop-03")).toEqual({ "cookie-box": 3, "banana-bread": 3 });
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem(storageKey("drop-03"), "not json");
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    expect(result.current.qty).toEqual({});
    expect(result.current.hydrated).toBe(true);
  });

  it("prefers an explicit initial cart over storage", () => {
    window.localStorage.setItem(storageKey("drop-03"), JSON.stringify({ "cookie-box": 4 }));
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800, initial: { "banana-bread": 9 } });
    expect(result.current.qty).toEqual({ "banana-bread": 3 });
  });

  it("does not carry quantities into another drop when dropId changes without a remount", () => {
    const { result, update } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    act(() => result.current.set("cookie-box", 2));
    expect(saved("drop-03")).toEqual({ "cookie-box": 2 });

    update({ dropId: "drop-04" });
    expect(result.current.hydrated).toBe(true);
    expect(result.current.qty).toEqual({});
    expect(result.current.count).toBe(0);
    expect(saved("drop-04")).toEqual({});
    expect(saved("drop-03")).toEqual({ "cookie-box": 2 });

    act(() => result.current.set("banana-bread", 1));
    expect(saved("drop-04")).toEqual({ "banana-bread": 1 });
    expect(saved("drop-03")).toEqual({ "cookie-box": 2 });

    update({ dropId: "drop-03" });
    expect(result.current.qty).toEqual({ "cookie-box": 2 });
  });

  it("loads the other drop's saved cart on switch", () => {
    window.localStorage.setItem(storageKey("drop-04"), JSON.stringify({ "banana-bread": 2 }));
    const { result, update } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    act(() => result.current.set("cookie-box", 5));
    update({ dropId: "drop-04" });
    expect(result.current.qty).toEqual({ "banana-bread": 2 });
    expect(saved("drop-04")).toEqual({ "banana-bread": 2 });
  });

  it("seeds a sample cart from ?demo= outside production", () => {
    window.history.replaceState({}, "", "/?demo=cart");
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    expect(result.current.qty).toEqual({ "cookie-box": 1, "banana-bread": 1 });
  });
});
