import { describe, expect, it } from "vitest";
import { buildTimeline, csvCell, displayState, filterQuery, likeAnywhere, parseOrderFilters, toCsv, validateNote, type TimelineSource } from "./order-admin-rules";

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
      events: [{ kind: "note", body: "Asked for a 14–16 slot.", createdAt: t("2026-11-09T03:00:00Z"), by: "Brendan" }],
      refunds: [{ amount: 1000, reason: "customer_cancelled", createdAt: t("2026-11-10T00:00:00Z"), issuedAt: null }],
      cancelledAt: t("2026-11-10T00:00:00Z"),
    });
    expect(tl.map((e) => e.title)).toEqual(["Order placed", "Paid", "Order confirmation emailed", "New-order email to the owner", "Note", "Cancelled", "Refund of ¥1,000 recorded"]);
    expect(tl[0].detail).toBe("Mock payment: Stripe not wired yet");
    expect(tl[3].detail).toBe("Failed to owner@x: RESEND_API_KEY is not set");
    expect(tl[4]).toMatchObject({ kind: "note", detail: "Asked for a 14–16 slot.", by: "Brendan" });
    expect(tl[6].detail).toBe("customer cancelled; owed until payments are connected");
  });

  it("shows shipping with its tracking number, and an issued refund twice (recorded, then issued)", () => {
    const tl = buildTimeline({ ...base, shippedAt: t("2026-11-21T00:00:00Z"), trackingNumber: "1234-5678-9012", refunds: [{ amount: 500, reason: "damage", createdAt: t("2026-11-23T00:00:00Z"), issuedAt: t("2026-11-23T01:00:00Z") }] });
    expect(tl.find((e) => e.title === "Shipped")?.detail).toBe("Tracking 1234-5678-9012");
    expect(tl.filter((e) => e.kind === "money").map((e) => e.title)).toEqual(["Refund of ¥500 recorded", "Refund of ¥500 issued"]);
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

  it("starts with a byte-order mark and ends lines with CRLF, so Excel reads Japanese correctly", () => {
    const csv = toCsv([["Order", "Recipient"], ["AB-005-001", "山田花子"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("Order,Recipient\r\nAB-005-001,山田花子\r\n");
  });
});
