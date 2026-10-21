import { describe, expect, it } from "vitest";
import { canCancel, canChangeSlot, orderStatus } from "./order-status";

const ORDER_STATES = ["pending_payment", "paid", "packed", "shipped", "complete", "expired", "cancelled"] as const;
/** The drop's lifecycle in time order (PRD 5.2a); draft and cancelled sit outside it. */
const DROP_TIMELINE = ["scheduled", "open", "closed", "baking", "shipped", "complete"] as const;
const DROP_STATES = ["draft", ...DROP_TIMELINE, "cancelled"] as const;

describe("orderStatus", () => {
  it("covers the whole matrix and never regresses as the drop moves on", () => {
    const rank: Record<string, number> = { confirmed: 1, baking: 2, shipped: 3, delivered: 4 };
    for (const o of ORDER_STATES) {
      for (const d of DROP_STATES) {
        expect(["awaiting_payment", "confirmed", "baking", "shipped", "delivered", "cancelled", "expired"]).toContain(orderStatus(o, d));
      }
      if (o === "paid" || o === "packed") {
        // the drop only ever moves forward in time; the derived status must not move backward
        let last = 0;
        for (const d of DROP_TIMELINE) {
          const s = orderStatus(o, d);
          expect(rank[s]).toBeGreaterThanOrEqual(last);
          last = rank[s];
        }
      }
    }
    expect(orderStatus("paid", "complete")).toBe("baking");
    expect(orderStatus("packed", "complete")).toBe("baking");
  });

  it("maps the order and drop states to the customer-facing words (PRD 2.5)", () => {
    expect(orderStatus("paid", "open")).toBe("confirmed");
    expect(orderStatus("paid", "closed")).toBe("confirmed");
    expect(orderStatus("paid", "baking")).toBe("baking");
    expect(orderStatus("packed", "baking")).toBe("baking");
    expect(orderStatus("paid", "shipped")).toBe("baking"); // the drop shipped but this order hasn't been marked yet
    expect(orderStatus("shipped", "shipped")).toBe("shipped");
    expect(orderStatus("complete", "complete")).toBe("delivered");
    expect(orderStatus("pending_payment", "open")).toBe("awaiting_payment");
    expect(orderStatus("cancelled", "open")).toBe("cancelled");
    expect(orderStatus("expired", "open")).toBe("expired");
  });
});

describe("canChangeSlot", () => {
  it("opens and closes with free cancellation across every state (D21)", () => {
    for (const o of ORDER_STATES) for (const d of DROP_STATES) expect(canChangeSlot(o, d)).toBe(canCancel(o, d));
  });
});

describe("canCancel", () => {
  it("allows self-serve cancellation only while the drop is open and the order is live (D22)", () => {
    expect(canCancel("paid", "open")).toBe(true);
    expect(canCancel("pending_payment", "open")).toBe(true);
    for (const d of ["closed", "baking", "shipped", "complete", "scheduled", "cancelled", "draft"] as const) expect(canCancel("paid", d)).toBe(false);
    for (const o of ["packed", "shipped", "complete", "cancelled", "expired"] as const) expect(canCancel(o, "open")).toBe(false);
  });
});
