import { describe, expect, it } from "vitest";
import {
  adminCanCancel, buildTimeline, canEditDelivery, canShip, cancelRefusal, csvCell, deliveryRefusal, displayState, filterQuery, hasShipped, likeAnywhere, parseOrderFilters,
  parseYen, refundable, shipRefusal, textCell, toCsv, validateNote, validateOptionalNote, validateRefund, type TimelineSource,
} from "./order-admin-rules";

describe("displayState", () => {
  it("shows an unpaid order as expired once its checkout no longer holds the boxes", () => {
    expect(displayState("pending_payment", true)).toBe("pending_payment");
    expect(displayState("pending_payment", false)).toBe("expired");
    expect(displayState("paid", false)).toBe("paid");
  });
});

describe("filters", () => {
  it("reads drop, state, search and page from the query string, dropping anything malformed", () => {
    expect(parseOrderFilters({ drop: "drop-05", state: "paid", q: "  hanako ", page: "2" })).toEqual({ drop: "drop-05", state: "paid", q: "hanako", page: 2 });
    expect(parseOrderFilters({ drop: "Drop 05; drop table", state: "lost", page: "-1" })).toEqual({ drop: undefined, state: undefined, q: undefined, page: 1 });
    expect(parseOrderFilters({ state: ["expired", "paid"], q: "x".repeat(300) }).q).toHaveLength(100);
    expect(parseOrderFilters({ state: ["expired", "paid"] }).state).toBe("expired");
  });

  it("writes the filters back as a query string, page 1 left out", () => {
    expect(filterQuery({ drop: "drop-05", q: "a b&c", page: 1 })).toBe("?drop=drop-05&q=a+b%26c");
    expect(filterQuery({ state: "paid", page: 1 }, { page: 3 })).toBe("?state=paid&page=3");
    expect(filterQuery({ page: 1 })).toBe("");
  });

  it("matches the search literally, LIKE's wildcards included", () => {
    expect(likeAnywhere("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});

describe("validateNote", () => {
  it("trims, and refuses an empty or overlong note", () => {
    expect(validateNote("  Called about the slot.  ")).toEqual({ ok: true, body: "Called about the slot." });
    expect(validateNote("   ")).toEqual({ ok: false, error: "Write something first." });
    expect(validateNote("x".repeat(2001))).toEqual({ ok: false, error: "At most 2,000 characters (this is 2,001)." });
    expect(validateNote(42).ok).toBe(false);
  });
});

describe("buildTimeline", () => {
  const t = (iso: string) => new Date(iso);
  const base: TimelineSource = {
    createdAt: t("2026-11-08T01:00:00Z"), paidAt: t("2026-11-08T01:00:00Z"), cancelledAt: null, packedAt: null, shippedAt: null, trackingNumber: null,
    state: "paid", systemNote: "Mock payment: Stripe not wired yet", refunds: [], emails: [], events: [],
  };

  it("puts everything in time order, and keeps the order placed before what happened at the same moment", () => {
    const tl = buildTimeline({
      ...base,
      emails: [{ type: "order_confirmation", to: "a@b.c", sentAt: t("2026-11-08T01:00:01Z"), error: null }, { type: "internal", to: "owner@x", sentAt: t("2026-11-08T01:00:01Z"), error: "RESEND_API_KEY is not set" }],
      events: [{ kind: "note", body: "Asked for a 14–16 slot.", data: {}, createdAt: t("2026-11-09T03:00:00Z"), by: "Brendan" }],
      refunds: [{ id: "r1", amount: 1000, reason: "customer_cancelled", createdAt: t("2026-11-10T00:00:00Z"), issuedAt: null }],
      cancelledAt: t("2026-11-10T00:00:00Z"),
    });
    expect(tl.map((e) => e.title)).toEqual(["Order placed", "Paid", "Order confirmation emailed", "New-order email to the owner", "Note", "Cancelled", "Refund of ¥1,000 recorded"]);
    expect(tl[0].detail).toBe("Mock payment: Stripe not wired yet");
    expect(tl[3].detail).toBe("Failed to owner@x: RESEND_API_KEY is not set");
    expect(tl[4]).toMatchObject({ kind: "note", detail: "Asked for a 14–16 slot.", by: "Brendan" });
    expect(tl[6].detail).toBe("Customer cancelled. Owed until payments are connected");
  });

  it("shows shipping with its tracking number, and an issued refund twice (recorded, then issued)", () => {
    const tl = buildTimeline({ ...base, shippedAt: t("2026-11-21T00:00:00Z"), trackingNumber: "123456789012", refunds: [{ id: "r1", amount: 500, reason: "damage", createdAt: t("2026-11-23T00:00:00Z"), issuedAt: t("2026-11-23T01:00:00Z") }] });
    expect(tl.find((e) => e.title === "Shipped")?.detail).toBe("Tracking 1234-5678-9012");
    expect(tl.filter((e) => e.kind === "money").map((e) => e.title)).toEqual(["Refund of ¥500 recorded", "Refund of ¥500 issued"]);
  });

  it("tells who cancelled and why on the Cancelled step, and who refunded and why on the refund, not as separate entries", () => {
    const tl = buildTimeline({
      ...base,
      state: "cancelled",
      cancelledAt: t("2026-11-12T00:00:00Z"),
      refunds: [
        { id: "r1", amount: 500, reason: "damage", createdAt: t("2026-11-11T00:00:00Z"), issuedAt: null },
        { id: "r2", amount: 1500, reason: "admin_cancelled", createdAt: t("2026-11-12T00:00:00Z"), issuedAt: null },
      ],
      events: [
        { kind: "refund", body: "Lid crushed in the photo.", data: { refundId: "r1" }, createdAt: t("2026-11-11T00:00:00Z"), by: "Owner" },
        { kind: "cancelled", body: "Customer asked by phone.", data: { source: "admin" }, createdAt: t("2026-11-12T00:00:00Z"), by: "Owner" },
      ],
    });
    expect(tl.map((e) => e.title)).toEqual(["Order placed", "Paid", "Refund of ¥500 recorded", "Cancelled", "Refund of ¥1,500 recorded"]);
    expect(tl[2]).toMatchObject({ detail: "Damage. Owed until payments are connected. Lid crushed in the photo.", by: "Owner" });
    expect(tl[3]).toMatchObject({ detail: "By the shop. Customer asked by phone.", by: "Owner" });
    expect(tl[4]).toMatchObject({ detail: "Cancelled by the shop. Owed until payments are connected" });
    expect(tl[4].by).toBeUndefined();
  });

  it("signs the Shipped step with who shipped it, and shows other actions as steps with what changed", () => {
    const at = (d: number) => t(`2026-11-2${d}T00:00:00Z`);
    const tl = buildTimeline({
      ...base,
      state: "shipped",
      shippedAt: at(1),
      trackingNumber: "123456789099",
      events: [
        { kind: "delivery_changed", body: "Delivery details changed", data: { detail: "Time slot: none → 18_20" }, createdAt: at(0), by: "Owner" },
        { kind: "shipped", body: "Shipped", data: { tracking: "123456789012" }, createdAt: at(1), by: "Owner" },
        { kind: "tracking_changed", body: "Tracking number corrected", data: { detail: "1234-5678-9012 → 1234-5678-9099" }, createdAt: at(2), by: "Owner" },
        { kind: "email_resent", body: "Shipping email sent again", data: { email: "shipped" }, createdAt: at(3), by: "Owner" },
      ],
    });
    expect(tl.map((e) => e.title)).toEqual(["Order placed", "Paid", "Delivery details changed", "Shipped", "Tracking number corrected", "Shipping email sent again"]);
    expect(tl[2]).toMatchObject({ kind: "step", detail: "Time slot: none → 18_20", by: "Owner" });
    expect(tl[3]).toMatchObject({ detail: "Tracking 1234-5678-9099", by: "Owner" });
    expect(tl[4]).toMatchObject({ detail: "1234-5678-9012 → 1234-5678-9099", by: "Owner" });
    expect(tl[5].detail).toBeUndefined();
  });

  it("says a customer's own cancellation and a cancelled drop apart", () => {
    const at = t("2026-11-12T00:00:00Z");
    const step = (source: string) => buildTimeline({ ...base, state: "cancelled", cancelledAt: at, events: [{ kind: "cancelled", body: "", data: { source }, createdAt: at, by: null }] }).find((e) => e.title === "Cancelled");
    expect(step("customer")).toMatchObject({ detail: "By the customer, from their order page" });
    expect(step("drop")).toMatchObject({ detail: "The whole drop was cancelled" });
    // Cancelled before events were recorded: just the step.
    expect(buildTimeline({ ...base, state: "cancelled", cancelledAt: at }).find((e) => e.title === "Cancelled")?.detail).toBeUndefined();
  });
});

describe("cancel and refund rules", () => {
  it("lets the shop cancel a paid order until it ships, and says why not otherwise", () => {
    expect(adminCanCancel("paid")).toBe(true);
    expect(adminCanCancel("packed")).toBe(true);
    for (const s of ["pending_payment", "shipped", "complete", "expired", "cancelled"] as const) expect(adminCanCancel(s)).toBe(false);
    expect(cancelRefusal("shipped")).toBe("It has shipped, so it can't be cancelled. Record a refund instead.");
    expect(cancelRefusal("cancelled")).toBe("This order is already cancelled.");
    expect(cancelRefusal("pending_payment")).toBe("It was never paid, so there's nothing to cancel or refund.");
  });

  it("refunds at most what was paid and isn't refunded yet", () => {
    const paidAt = new Date();
    expect(refundable({ paidAt, total: 2000, refunded: 0 })).toBe(2000);
    expect(refundable({ paidAt, total: 2000, refunded: 500 })).toBe(1500);
    expect(refundable({ paidAt, total: 2000, refunded: 2500 })).toBe(0);
    expect(refundable({ paidAt: null, total: 2000, refunded: 0 })).toBe(0);
  });

  it("reads yen however it's typed", () => {
    expect(parseYen("1500")).toBe(1500);
    expect(parseYen(" ¥1,500 ")).toBe(1500);
    expect(parseYen("１，５００円")).toBe(1500);
    expect(parseYen("￥800")).toBe(800);
    expect(parseYen(1500)).toBe(1500);
    for (const bad of ["", "15.5", "-100", "1e3", "abc", 1.5, null]) expect(parseYen(bad)).toBeNull();
  });

  it("validates a refund against what's left, and wants a note for Other", () => {
    expect(validateRefund({ amount: "500", reason: "damage", note: "  Lid crushed. " }, 2000)).toEqual({ ok: true, value: { amount: 500, reason: "damage", note: "Lid crushed." } });
    expect(validateRefund({ amount: "2000", reason: "non_delivery" }, 2000)).toEqual({ ok: true, value: { amount: 2000, reason: "non_delivery", note: "" } });
    expect(validateRefund({ amount: "2001", reason: "damage" }, 2000)).toEqual({ ok: false, errors: { amount: "At most ¥2,000 is left to refund." } });
    expect(validateRefund({ amount: "0", reason: "nope" }, 2000)).toEqual({ ok: false, errors: { amount: "Enter an amount in yen, like 1500.", reason: "Pick a reason." } });
    expect(validateRefund({ amount: "100", reason: "other", note: " " }, 2000)).toEqual({ ok: false, errors: { note: "Say what it's for. Only the shop sees this." } });
    expect(validateRefund({ amount: "100", reason: "damage", note: "x".repeat(2001) }, 2000)).toEqual({ ok: false, errors: { note: "At most 2,000 characters (this is 2,001)." } });
    expect(validateRefund({ amount: "100", reason: "damage" }, 0)).toEqual({ ok: false, errors: { amount: "Nothing is left to refund." } });
  });

  it("allows an empty optional note but not an overlong one", () => {
    expect(validateOptionalNote("  ")).toEqual({ ok: true, body: "" });
    expect(validateOptionalNote(undefined)).toEqual({ ok: true, body: "" });
    expect(validateOptionalNote(" why ")).toEqual({ ok: true, body: "why" });
    expect(validateOptionalNote("x".repeat(2001)).ok).toBe(false);
  });
});

describe("CSV", () => {
  it("quotes what needs quoting and leaves numbers and plain text alone", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(1500)).toBe("1500");
    expect(csvCell("Tanaka, Hanako")).toBe('"Tanaka, Hanako"');
    expect(csvCell('say "hi"\nthere')).toBe('"say ""hi""\nthere"');
    expect(csvCell(null)).toBe("");
  });

  it("defuses cells a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+81 90")).toBe("'+81 90");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell(-1)).toBe("-1"); // a real number stays a number
  });

  it("keeps an all-digit phone or tracking number as text, so the leading 0 survives Excel and Numbers", () => {
    expect(csvCell(textCell("09012345678"))).toBe('"=""09012345678"""');
    expect(csvCell(textCell("001234567890"))).toBe('"=""001234567890"""');
    expect(csvCell(textCell("090-1234-5678"))).toBe("090-1234-5678"); // hyphens already make it text
    expect(csvCell(textCell(null))).toBe("");
    expect(csvCell(textCell("=1+1"))).toBe("'=1+1"); // anything but digits goes through the formula guard
    expect(csvCell(textCell('1"),HYPERLINK("x'))).toBe('"1""),HYPERLINK(""x"');
  });

  it("starts with a byte-order mark and ends lines with CRLF, so Excel reads Japanese correctly", () => {
    const csv = toCsv([["Order", "Recipient"], ["AB-005-001", "山田花子"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("Order,Recipient\r\nAB-005-001,山田花子\r\n");
  });
});

describe("shipping and delivery rules", () => {
  it("ships and edits a paid or packed order only, and says why not otherwise", () => {
    for (const st of ["paid", "packed"] as const) expect(canShip(st) && canEditDelivery(st)).toBe(true);
    for (const st of ["pending_payment", "shipped", "complete", "expired", "cancelled"] as const) expect(canShip(st) || canEditDelivery(st)).toBe(false);
    expect(shipRefusal("shipped")).toBe("It has shipped already. Correct the tracking number instead.");
    expect(shipRefusal("cancelled")).toBe("It was cancelled.");
    expect(shipRefusal("pending_payment")).toBe("It hasn't been paid.");
    expect(deliveryRefusal("complete")).toBe("It has shipped, so its delivery details can't change.");
    expect(deliveryRefusal("expired")).toBe("It hasn't been paid.");
  });
  it("corrects tracking only once an order has shipped", () => {
    expect(hasShipped("shipped") && hasShipped("complete")).toBe(true);
    expect(hasShipped("packed")).toBe(false);
  });
});
