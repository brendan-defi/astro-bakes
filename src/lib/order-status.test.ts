import { describe, expect, it } from "vitest";
import { canCancel, orderStatus } from "./order-status";

describe("orderStatus", () => {
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

describe("canCancel", () => {
  it("allows self-serve cancellation only while the drop is open and the order is live (D22)", () => {
    expect(canCancel("paid", "open")).toBe(true);
    expect(canCancel("pending_payment", "open")).toBe(true);
    for (const d of ["closed", "baking", "shipped", "complete", "scheduled", "cancelled", "draft"] as const) expect(canCancel("paid", d)).toBe(false);
    for (const o of ["packed", "shipped", "complete", "cancelled", "expired"] as const) expect(canCancel(o, "open")).toBe(false);
  });
});
