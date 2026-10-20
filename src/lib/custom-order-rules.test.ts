import { describe, expect, it } from "vitest";
import { dateRange, DETAILS_MAX, NAME_MAX, tokyoDay, validateCustomOrder, type CustomOrderInput } from "./custom-order-rules";

// 2026-10-20 23:30 JST: late enough that UTC is still on the 20th but Tokyo is about to roll over.
const NOW = new Date("2026-10-20T14:30:00Z");
const ok: CustomOrderInput = { name: "Hanako", email: "hanako@example.com", eventDate: "2026-11-14", partySize: "20to50", occasion: "office", details: "40 cookies, half matcha." };
const fields = (over: Partial<CustomOrderInput>) => { const r = validateCustomOrder({ ...ok, ...over }, NOW); return r.ok ? [] : r.fields; };

describe("tokyoDay / dateRange", () => {
  it("counts in Tokyo calendar days, not UTC", () => {
    expect(tokyoDay(new Date("2026-10-20T14:59:00Z"))).toBe("2026-10-20");
    expect(tokyoDay(new Date("2026-10-20T15:00:00Z"))).toBe("2026-10-21");
  });
  it("offers tomorrow to a year out", () => {
    expect(dateRange(NOW)).toEqual({ min: "2026-10-21", max: "2027-10-20" });
  });
});

describe("validateCustomOrder", () => {
  it("accepts a complete request and normalises it", () => {
    const r = validateCustomOrder({ ...ok, name: "  Hanako\n  Yamada ", email: " Hanako@Example.COM ", details: "line one\r\nline two  " }, NOW);
    expect(r).toEqual({ ok: true, request: { ...ok, name: "Hanako Yamada", email: "hanako@example.com", details: "line one\nline two" } });
  });

  it("reports every missing field at once", () => {
    expect(validateCustomOrder({ name: "", email: "", eventDate: "", partySize: "", details: "" }, NOW)).toEqual({ ok: false, fields: ["name", "email", "eventDate", "partySize", "details"] });
  });

  it("takes dates from tomorrow (Tokyo) up to a year out", () => {
    expect(fields({ eventDate: "2026-10-20" })).toEqual(["eventDate"]); // today
    expect(fields({ eventDate: "2026-10-21" })).toEqual([]); // tomorrow
    expect(fields({ eventDate: "2027-10-20" })).toEqual([]);
    expect(fields({ eventDate: "2027-10-21" })).toEqual(["eventDate"]);
  });

  it("rejects dates that don't exist or aren't ISO days", () => {
    expect(fields({ eventDate: "2026-02-30" })).toEqual(["eventDate"]);
    expect(fields({ eventDate: "2026-13-01" })).toEqual(["eventDate"]);
    expect(fields({ eventDate: "14/11/2026" })).toEqual(["eventDate"]);
  });

  it("only takes the listed party sizes", () => {
    expect(fields({ partySize: "1000" })).toEqual(["partySize"]);
  });

  it("drops an unknown occasion instead of failing (it's optional)", () => {
    const r = validateCustomOrder({ ...ok, occasion: "bar mitzvah" }, NOW);
    expect(r.ok && r.request.occasion).toBeNull();
    const none = validateCustomOrder({ ...ok, occasion: null }, NOW);
    expect(none.ok && none.request.occasion).toBeNull();
  });

  it("caps the name and details lengths", () => {
    expect(fields({ name: "x".repeat(NAME_MAX + 1) })).toEqual(["name"]);
    expect(fields({ details: "x".repeat(DETAILS_MAX + 1) })).toEqual(["details"]);
    expect(fields({ details: "x".repeat(DETAILS_MAX) })).toEqual([]);
  });

  it("strips control characters and treats a blank-after-cleaning field as missing", () => {
    expect(fields({ name: "\u0000\u0007" })).toEqual(["name"]);
    const r = validateCustomOrder({ ...ok, details: "hi\u0000 there\tfriend" }, NOW);
    expect(r.ok && r.request.details).toBe("hi there\tfriend");
  });

  it("survives non-string values from a hand-made request", () => {
    const junk = { name: 1, email: null, eventDate: {}, partySize: [], details: undefined } as unknown as CustomOrderInput;
    expect(validateCustomOrder(junk, NOW)).toEqual({ ok: false, fields: ["name", "email", "eventDate", "partySize", "details"] });
  });
});
