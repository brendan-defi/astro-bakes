import { describe, expect, it } from "vitest";
import { boxes } from "./data";
import { formatReservationRef, parseReservationRef, reservationStatus, reservedLines, totals } from "./reservation";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const server = { checkoutId: ID, revision: 2, expiresAt: Date.now() + 60_000, items: { "cookie-box": 1 } };
const tab = (checkoutId: string | null, revision: number | null) => ({ expires: 1, checkoutId, revision });

describe("reservationStatus", () => {
  it("is none when the browser holds nothing", () => {
    expect(reservationStatus(null, null)).toBe("none");
    expect(reservationStatus(tab(ID, 2), null)).toBe("none");
  });
  it("is ok only when this tab reserved exactly what the server holds", () => {
    expect(reservationStatus(tab(ID, 2), server)).toBe("ok");
  });
  it("is stale when another tab reserved or re-reserved", () => {
    expect(reservationStatus(null, server)).toBe("stale");
    expect(reservationStatus(tab(null, null), server)).toBe("stale");
    expect(reservationStatus(tab(ID, 1), server)).toBe("stale");
    expect(reservationStatus(tab("c0", 2), server)).toBe("stale");
  });
  it("adopts a reservation named by the sign-in link only when it still matches the server exactly", () => {
    const ref = { checkoutId: ID, revision: 2 };
    expect(reservationStatus(null, server, ref)).toBe("adopt"); // new tab from the email
    expect(reservationStatus(tab(ID, 1), server, ref)).toBe("adopt"); // this tab's old copy, but the link names the current one
    expect(reservationStatus(null, server, { checkoutId: ID, revision: 1 })).toBe("stale"); // another tab changed it since the email
    expect(reservationStatus(null, server, { checkoutId: "other", revision: 2 })).toBe("stale");
    expect(reservationStatus(tab(ID, 2), server, { checkoutId: ID, revision: 1 })).toBe("ok"); // the tab's own copy wins
    expect(reservationStatus(null, null, ref)).toBe("none");
  });
});

describe("reservation refs", () => {
  it("round-trips and rejects junk", () => {
    expect(parseReservationRef(formatReservationRef({ checkoutId: ID, revision: 7 }))).toEqual({ checkoutId: ID, revision: 7 });
    for (const bad of ["", null, undefined, "abc:1", `${ID}:`, `${ID}:x`, `${ID}:1:2`, "------------------------------------:1"]) expect(parseReservationRef(bad)).toBeNull();
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
