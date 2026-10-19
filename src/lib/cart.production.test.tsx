import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CartProvider, useCart } from "./cart";
import { boxes } from "./data";

vi.mock("./demo", () => ({ demoEnabled: false }));

describe("CartProvider in production", () => {
  it("ignores ?demo= seeds", () => {
    window.history.replaceState({}, "", "/?demo=soldout");
    const wrapper = ({ children }: { children: ReactNode }) => <CartProvider dropId="drop-03" boxes={boxes} shippingFee={800}>{children}</CartProvider>;
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.hydrated).toBe(true);
    expect(result.current.qty).toEqual({});
  });
});
