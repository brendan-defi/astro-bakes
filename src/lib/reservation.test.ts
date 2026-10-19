import { describe, expect, it } from "vitest";
import { boxes } from "./data";
import { reservationStatus, reservedLines, totals } from "./reservation";

const server = { checkoutId: "c1", revision: 2, expiresAt: Date.now() + 60_000, items: { "cookie-box": 1 } };

describe("reservationStatus", () => {
  it("is none when the browser holds nothing", () => {
    expect(reservationStatus(null, null)).toBe("none");
    expect(reservationStatus({ expires: 1, checkoutId: "c1", revision: 2 }, null)).toBe("none");
  });
  it("is ok only when this tab reserved exactly what the server holds", () => {
    expect(reservationStatus({ expires: 1, checkoutId: "c1", revision: 2 }, server)).toBe("ok");
  });
  it("is stale when another tab reserved or re-reserved", () => {
    expect(reservationStatus(null, server)).toBe("stale");
    expect(reservationStatus({ expires: 1, checkoutId: null, revision: null }, server)).toBe("stale");
    expect(reservationStatus({ expires: 1, checkoutId: "c1", revision: 1 }, server)).toBe("stale");
    expect(reservationStatus({ expires: 1, checkoutId: "c0", revision: 2 }, server)).toBe("stale");
  });
});

describe("reservedLines / totals", () => {
  it("prices the reservation from the drop's boxes, not the local cart", () => {
    const lines = reservedLines({ "cookie-box": 1, "banana-bread": 2, ghost: 5 }, boxes);
    expect(lines.map((l) => [l.box.id, l.qty, l.lineTotal])).toEqual([
      ["cookie-box", 1, 1000],
      ["banana-bread", 2, 1000],
    ]);
    expect(totals(lines, 800)).toEqual({ count: 3, subtotal: 2000, total: 2800 });
    expect(totals(lines, null).total).toBeNull();
    expect(totals([], 800)).toEqual({ count: 0, subtotal: 0, total: null });
  });
});
