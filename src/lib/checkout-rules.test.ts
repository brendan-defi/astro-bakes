import { describe, expect, it } from "vitest";
import { EMAIL, orderNumber, reconcile, validateDelivery } from "./checkout-rules";

const avail = new Map([
  ["cookie-box", { left: 7, maxPerCustomer: 5 }],
  ["banana-bread", { left: 3, maxPerCustomer: 5 }],
  ["sampler-box", { left: 0, maxPerCustomer: 5 }],
]);

describe("reconcile", () => {
  it("keeps what fits and reports nothing", () => {
    expect(reconcile({ "cookie-box": 2, "banana-bread": 3 }, avail)).toEqual({ items: { "cookie-box": 2, "banana-bread": 3 }, changes: [] });
  });

  it("cuts to remaining stock and reports the cut", () => {
    const r = reconcile({ "banana-bread": 5 }, avail);
    expect(r.items).toEqual({ "banana-bread": 3 });
    expect(r.changes).toEqual([{ kind: "cut", box: "banana-bread", from: 5, to: 3, left: 3 }]);
  });

  it("cuts to the per-customer limit even when stock is higher (D7)", () => {
    const r = reconcile({ "cookie-box": 9 }, avail);
    expect(r.items).toEqual({ "cookie-box": 5 });
    expect(r.changes).toEqual([{ kind: "cut", box: "cookie-box", from: 9, to: 5, left: 7 }]);
  });

  it("drops sold-out and unknown boxes as gone", () => {
    const r = reconcile({ "sampler-box": 1, ghost: 2 }, avail);
    expect(r.items).toEqual({});
    expect(r.changes).toEqual([
      { kind: "gone", box: "sampler-box", from: 1 },
      { kind: "gone", box: "ghost", from: 2 },
    ]);
  });

  it("ignores zero, negative and junk quantities", () => {
    expect(reconcile({ "cookie-box": 0, "banana-bread": -2, ghost: Number.NaN }, avail)).toEqual({ items: {}, changes: [] });
    expect(reconcile({ "cookie-box": 2.9 }, avail).items).toEqual({ "cookie-box": 2 });
  });
});

describe("orderNumber", () => {
  it("formats drop and sequence as AB-DDD-NNN", () => {
    expect(orderNumber(3, 17)).toBe("AB-003-017");
    expect(orderNumber(12, 1)).toBe("AB-012-001");
    expect(orderNumber(4, 1234)).toBe("AB-004-1234");
  });
});

describe("validateDelivery", () => {
  const good = { name: "山田 花子", phone: "090-1234-5678", postal: "153-0061", line1: "1-2-3", line2: "" };

  it("accepts a complete address inside the 23 wards", () => {
    const r = validateDelivery(good);
    expect(r.ok).toBe(true);
    expect(r.postal).toBe("1530061");
    expect(r.hit).toMatchObject({ city: "目黒区", wardCode: "13110", deliverable: true });
  });

  it("normalises full-width digits", () => {
    expect(validateDelivery({ ...good, postal: "１５３－００６１" }).postal).toBe("1530061");
  });

  it("rejects missing fields", () => {
    expect(validateDelivery({ ...good, name: " ", phone: "", line1: "" }).errors).toEqual(["name", "phone", "line1"]);
  });

  it("rejects unknown and out-of-area postal codes (D20)", () => {
    expect(validateDelivery({ ...good, postal: "999-9999" }).errors).toEqual(["postal"]);
    expect(validateDelivery({ ...good, postal: "180-0004" }).errors).toEqual(["area"]);
    expect(validateDelivery({ ...good, postal: "231-0001" }).errors).toEqual(["area"]);
  });

  it("does not crash on a missing payload", () => {
    expect(validateDelivery(undefined as unknown as typeof good).ok).toBe(false);
  });
});

describe("EMAIL", () => {
  it("accepts ordinary addresses and rejects the obvious", () => {
    expect(EMAIL.test("you@example.com")).toBe(true);
    expect(EMAIL.test("hanako+astro@example.co.jp")).toBe(true);
    for (const bad of ["", "you", "you@", "@example.com", "you @example.com"]) expect(EMAIL.test(bad)).toBe(false);
  });
});
