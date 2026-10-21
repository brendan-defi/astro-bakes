import { act, cleanup, renderHook } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense, type ReactNode } from "react";
import { CartProvider, maxFor, mergeQuantities, sanitize, storageKey, useCart } from "./cart";
import type { Box } from "./data";
import { writeStored } from "./stored";

const box = (over: Partial<Box> & { id: string }): Box => ({
  name: over.id, desc: "", contents: "", allergens: [], price: 1000, left: 10, maxPerCustomer: 5, tint: "", tilt: "", ...over,
});
const cookie = box({ id: "cookie-box", price: 1000, left: 7 });
const loaf = box({ id: "banana-bread", price: 500, left: 3 });
const soldOut = box({ id: "sampler-box", price: 900, left: 0 });
const boxes = [cookie, loaf, soldOut];

type Props = { dropId: string; boxes: Box[]; shippingFee: number | null };
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
// Unmount each test's carts: one left mounted would still be listening to storage in the next test.
afterEach(cleanup);

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

describe("mergeQuantities", () => {
  it("adds to what is already there and clamps the result (PRD 2.5 'Order again')", () => {
    expect(mergeQuantities({ "banana-bread": 1 }, { "cookie-box": 2 }, boxes)).toEqual({ "banana-bread": 1, "cookie-box": 2 });
    expect(mergeQuantities({ "cookie-box": 4 }, { "cookie-box": 4 }, boxes)).toEqual({ "cookie-box": 5 }); // per-customer limit
    expect(mergeQuantities({ "banana-bread": 2 }, { "banana-bread": 2 }, boxes)).toEqual({ "banana-bread": 3 }); // stock
    expect(mergeQuantities({ ghost: 3 }, { "sampler-box": 1 }, boxes)).toEqual({ ghost: 3 }); // sold out isn't added; a box these boxes don't know stays
  });

  it("only changes the boxes being added, and never lowers what's there (review of #24)", () => {
    const olderView = [box({ id: "cookie-box", left: 1 }), loaf];
    expect(mergeQuantities({ "cookie-box": 3 }, { "banana-bread": 1 }, olderView)).toEqual({ "cookie-box": 3, "banana-bread": 1 });
    expect(mergeQuantities({ "cookie-box": 3 }, { "cookie-box": 1 }, olderView)).toEqual({ "cookie-box": 3 });
    expect(mergeQuantities({ "new-box": 2 }, { "banana-bread": 1 }, olderView)).toEqual({ "new-box": 2, "banana-bread": 1 });
    expect(mergeQuantities({ "banana-bread": "junk" as unknown as number }, { "banana-bread": 1 }, olderView)).toEqual({ "banana-bread": 1 });
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

  it("shows the saved cart clamped to this drop's stock, and saves only the box that changes", () => {
    window.localStorage.setItem(storageKey("drop-03"), JSON.stringify({ "cookie-box": 2, "banana-bread": 9, ghost: 4 }));
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    expect(result.current.hydrated).toBe(true);
    expect(result.current.qty).toEqual({ "cookie-box": 2, "banana-bread": 3 });
    act(() => result.current.inc("cookie-box"));
    expect(saved("drop-03")).toEqual({ "cookie-box": 3, "banana-bread": 9, ghost: 4 });
    act(() => result.current.dec("banana-bread")); // from the 3 shown, not the 9 saved
    expect(saved("drop-03")).toEqual({ "cookie-box": 3, "banana-bread": 2, ghost: 4 });
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem(storageKey("drop-03"), "not json");
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    expect(result.current.qty).toEqual({});
    expect(result.current.hydrated).toBe(true);
  });

  it("does not carry quantities into another drop when dropId changes without a remount", () => {
    const { result, update } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    act(() => result.current.set("cookie-box", 2));
    expect(saved("drop-03")).toEqual({ "cookie-box": 2 });

    update({ dropId: "drop-04" });
    expect(result.current.hydrated).toBe(true);
    expect(result.current.qty).toEqual({});
    expect(result.current.count).toBe(0);
    expect(saved("drop-04")).toBeNull(); // nothing saved for drop 04 until something's in its cart
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

  it("shows the new drop's cart clamped to the new stock when the drop and its boxes change together", () => {
    // Review of #24: the switch has to use the new drop's boxes, not the old ones.
    window.localStorage.setItem(storageKey("drop-04"), JSON.stringify({ "cookie-box": 5 }));
    const { result, update } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    act(() => result.current.set("cookie-box", 4));
    update({ dropId: "drop-04", boxes: [box({ id: "cookie-box", left: 2 }), loaf] });
    expect(result.current.qty).toEqual({ "cookie-box": 2 });
    expect(saved("drop-04")).toEqual({ "cookie-box": 5 }); // shown clamped, not rewritten
    expect(saved("drop-03")).toEqual({ "cookie-box": 4 });
  });

  it("keeps the cart when the same drop's boxes refresh, showing it clamped to the new stock", () => {
    const { result, update } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    act(() => { result.current.set("cookie-box", 4); result.current.set("banana-bread", 2); });
    update({ boxes: [box({ id: "cookie-box", price: 1200, left: 7 }), loaf] }); // a price change: quantities untouched
    expect(result.current.qty).toEqual({ "cookie-box": 4, "banana-bread": 2 });
    update({ boxes: [box({ id: "cookie-box", left: 3 }), loaf] }); // stock sold elsewhere
    expect(result.current.qty).toEqual({ "cookie-box": 3, "banana-bread": 2 });
    expect(saved("drop-03")).toEqual({ "cookie-box": 4, "banana-bread": 2 });
    update({ boxes: [box({ id: "cookie-box", left: 7 }), loaf] }); // and freed up again
    expect(result.current.qty).toEqual({ "cookie-box": 4, "banana-bread": 2 });
  });

  it("does not let an idle stale tab shrink a newer tab's cart", () => {
    // Review of #24 (follow-up): an older tab clamped every incoming change to its own stock and saved that.
    const { result } = mount({ dropId: "drop-03", boxes: [box({ id: "cookie-box", left: 1 })], shippingFee: 800 });
    act(() => result.current.set("cookie-box", 1));
    const key = storageKey("drop-03");
    window.localStorage.setItem(key, JSON.stringify({ "cookie-box": 3 }));
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key, storageArea: window.localStorage })); });
    expect(saved("drop-03")).toEqual({ "cookie-box": 3 });
    expect(result.current.qty).toEqual({ "cookie-box": 1 }); // the old tab still only shows what it thinks is left
  });

  it("lets a tab with older stock change its own boxes without touching the rest of a newer tab's cart", () => {
    const older = mount({ dropId: "drop-03", boxes: [box({ id: "cookie-box", left: 1 }), loaf], shippingFee: 800 });
    const newer = mount({ dropId: "drop-03", boxes: [box({ id: "cookie-box", left: 5 }), loaf, box({ id: "matcha-box" })], shippingFee: 800 });
    act(() => { newer.result.current.set("cookie-box", 3); newer.result.current.set("matcha-box", 1); });
    expect(older.result.current.qty).toEqual({ "cookie-box": 1 });
    act(() => older.result.current.inc("banana-bread"));
    expect(saved("drop-03")).toEqual({ "cookie-box": 3, "matcha-box": 1, "banana-bread": 1 }); // a box the older tab doesn't know stays too
    expect(newer.result.current.qty).toEqual({ "cookie-box": 3, "matcha-box": 1, "banana-bread": 1 });
  });

  it("drops junk from the saved cart when it next changes, but keeps real quantities this tab can't sell", () => {
    window.localStorage.setItem(storageKey("drop-03"), JSON.stringify({ "cookie-box": "lots", "banana-bread": -2, "sampler-box": 1.5 }));
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    expect(result.current.qty).toEqual({}); // sold out here, as far as this tab knows
    act(() => result.current.set("cookie-box", 1));
    expect(saved("drop-03")).toEqual({ "sampler-box": 1, "cookie-box": 1 });
  });

  it("follows changes made in another tab", () => {
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    act(() => result.current.set("cookie-box", 1));
    const key = storageKey("drop-03");
    window.localStorage.setItem(key, JSON.stringify({ "cookie-box": 3, "banana-bread": 1 })); // the other tab's write
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key })); });
    expect(result.current.qty).toEqual({ "cookie-box": 3, "banana-bread": 1 });
    expect(result.current.count).toBe(4);
  });

  it("still works for this page when the browser blocks storage", () => {
    const blocked = () => { throw new DOMException("blocked", "SecurityError"); };
    const spies = [vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked), vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked)];
    try {
      const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
      act(() => { result.current.inc("cookie-box"); result.current.inc("cookie-box"); });
      expect(result.current.qty).toEqual({ "cookie-box": 2 });
    } finally {
      spies.forEach((s) => s.mockRestore());
      writeStored("local", storageKey("drop-03"), null); // forget the in-memory copy
    }
  });

  it("renders an empty cart on the server, so hydration matches whatever is saved", () => {
    window.localStorage.setItem(storageKey("drop-03"), JSON.stringify({ "cookie-box": 2 }));
    const Probe = () => { const c = useCart(); return <>{`${c.hydrated}:${c.count}`}</>; };
    expect(renderToString(<CartProvider dropId="drop-03" boxes={boxes} shippingFee={800}><Probe /></CartProvider>)).toBe("false:0");
  });

  it("hydrates the server's empty cart without a mismatch, then shows the saved one", async () => {
    // Shaped like the checkout page, with a Suspense boundary under the provider. jsdom doesn't order hydration work
    // the way a browser does, so the ordering bug this layout once hit is checked in a real browser, not here.
    window.localStorage.setItem(storageKey("drop-03"), JSON.stringify({ "cookie-box": 2 }));
    const Probe = () => { const c = useCart(); return <p>{c.hydrated ? `saved ${c.count}` : "loading"}</p>; };
    const tree = <CartProvider dropId="drop-03" boxes={boxes} shippingFee={800}><Suspense><Probe /></Suspense></CartProvider>;
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    expect(container.textContent).toBe("loading");
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: (e) => { errors.push(e); } }); });
    expect(errors).toEqual([]);
    expect(container.textContent).toBe("saved 2");
    act(() => root?.unmount()); // not RTL's, so cleanup() doesn't know about it
  });

  it("seeds a sample cart from ?demo= outside production", () => {
    window.history.replaceState({}, "", "/?demo=cart");
    const { result } = mount({ dropId: "drop-03", boxes, shippingFee: 800 });
    expect(result.current.qty).toEqual({ "cookie-box": 1, "banana-bread": 1 });
  });
});
