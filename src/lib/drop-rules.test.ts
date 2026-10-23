import { describe, expect, it } from "vitest";
import { dropSlug, editable, fromJstDay, fromJstLocal, nextMonth, toJstDay, toJstLocal, validateDrop, type DropContext } from "./drop-rules";

const NOW = new Date("2026-10-23T03:00:00Z"); // 12:00 JST
const ctx = (over: Partial<DropContext> = {}): DropContext => ({ creating: true, state: "draft", now: NOW, taken: {}, ...over });
const form = (over: Record<string, unknown> = {}) => ({
  number: "5", nameEn: "Drop 05 · December", nameJa: "ドロップ05 · 12月", descriptionEn: "", descriptionJa: "",
  openAt: "2026-12-06T10:00", closeAt: "2026-12-13T21:00", bakeAt: "2026-12-19T06:00", shipAt: "2026-12-20",
  boxes: [{ boxSlug: "cookie-box", cap: "20", price: "1000", maxPerCustomer: "5" }], ...over,
});
const errors = (r: ReturnType<typeof validateDrop>) => (r.ok ? {} : r.errors);

describe("Japan-time dates", () => {
  it("reads and writes datetime-local and date values in Japan time, whatever the machine's zone", () => {
    expect(fromJstLocal("2026-11-08T10:00")?.toISOString()).toBe("2026-11-08T01:00:00.000Z");
    expect(toJstLocal(new Date("2026-11-08T01:00:00Z"))).toBe("2026-11-08T10:00");
    expect(fromJstDay("2026-11-22")?.toISOString()).toBe("2026-11-21T15:00:00.000Z");
    expect(toJstDay(new Date("2026-11-21T15:00:00Z"))).toBe("2026-11-22");
    // Late evening UTC is already the next day in Japan.
    expect(toJstDay(new Date("2026-11-21T16:30:00Z"))).toBe("2026-11-22");
  });

  it("refuses dates that don't exist and malformed input", () => {
    for (const bad of ["2026-02-30T10:00", "2026-13-01T10:00", "2026-11-08 10:00", "", "tomorrow"]) expect(fromJstLocal(bad)).toBeNull();
    expect(fromJstDay("2026-02-29")).toBeNull();
    expect(fromJstDay("2028-02-29")).not.toBeNull();
  });

  it("moves a date a month on at the same Japan time, clamping to the month's last day", () => {
    expect(toJstLocal(nextMonth(fromJstLocal("2026-10-11T12:00")!))).toBe("2026-11-11T12:00");
    expect(toJstLocal(nextMonth(fromJstLocal("2027-01-31T21:00")!))).toBe("2027-02-28T21:00");
    expect(toJstLocal(nextMonth(fromJstLocal("2026-12-15T00:00")!))).toBe("2027-01-15T00:00");
  });

  it("names a drop's slug from its number", () => {
    expect(dropSlug(5)).toBe("drop-05");
    expect(dropSlug(123)).toBe("drop-123");
  });
});

describe("editable", () => {
  it("lets everything change before opening, caps while selling, and only names after", () => {
    expect(editable("draft")).toEqual({ dates: true, boxes: true, prices: true, caps: true });
    expect(editable("scheduled")).toEqual({ dates: true, boxes: true, prices: true, caps: true });
    for (const s of ["open", "closed", "baking"] as const) expect(editable(s)).toEqual({ dates: false, boxes: false, prices: false, caps: true });
    for (const s of ["shipped", "complete", "cancelled"] as const) expect(editable(s)).toEqual({ dates: false, boxes: false, prices: false, caps: false });
  });
});

describe("validateDrop", () => {
  it("accepts a complete new drop", () => {
    const r = validateDrop(form(), ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ number: 5, nameJa: "ドロップ05 · 12月", boxes: [{ boxSlug: "cookie-box", cap: 20, price: 1000, maxPerCustomer: 5 }] });
    expect(r.value.shipAt.toISOString()).toBe("2026-12-19T15:00:00.000Z");
  });

  it("keeps the dates in order: opens, closes, bakes, ships", () => {
    expect(errors(validateDrop(form({ closeAt: "2026-12-06T09:00" }), ctx())).closeAt).toBe("Must be after it opens.");
    expect(errors(validateDrop(form({ shipAt: "2026-12-13" }), ctx())).shipAt).toBe("Must be after it closes.");
    expect(errors(validateDrop(form({ bakeAt: "2026-12-12T06:00" }), ctx())).bakeAt).toMatch(/Between the close/);
    expect(errors(validateDrop(form({ bakeAt: "2026-12-21T06:00" }), ctx())).bakeAt).toMatch(/Between the close/);
    expect(validateDrop(form({ bakeAt: "" }), ctx()).ok).toBe(true);
  });

  it("won't let a scheduled drop's opening move into the past (that's Open now), but a draft may sit anywhere", () => {
    expect(errors(validateDrop(form({ openAt: "2026-10-23T11:00" }), ctx({ creating: false, state: "scheduled" }))).openAt).toMatch(/Open now/);
    expect(validateDrop(form({ openAt: "2026-10-01T10:00", closeAt: "2026-10-05T21:00", bakeAt: "", shipAt: "2026-10-10" }), ctx()).ok).toBe(true);
  });

  it("checks boxes: at least one, each once, sensible numbers, and a cap no lower than sold plus held", () => {
    expect(errors(validateDrop(form({ boxes: [] }), ctx())).boxes).toBe("Add at least one box.");
    const e = errors(validateDrop(form({ boxes: [{ boxSlug: "a", cap: "5", price: "1000", maxPerCustomer: "5" }, { boxSlug: "a", cap: "5", price: "10", maxPerCustomer: "0" }, { boxSlug: "", cap: "-1", price: "1000", maxPerCustomer: "5" }] }), ctx()));
    expect(e).toMatchObject({ "boxes.1.box": "This box is already in the drop.", "boxes.1.price": "A whole number from 50 to 100,000.", "boxes.1.maxPerCustomer": "A whole number from 1 to 20.", "boxes.2.box": "Choose a box.", "boxes.2.cap": "A whole number from 0 to 1,000." });
    const taken = validateDrop(form({ boxes: [{ boxSlug: "cookie-box", cap: "12", price: "1000", maxPerCustomer: "5" }] }), ctx({ creating: false, state: "open", taken: { "cookie-box": { sold: 10, held: 3 } } }));
    expect(errors(taken)["boxes.0.cap"]).toBe("At least 13: 10 sold, 3 in checkouts right now.");
  });

  it("requires names in both languages, and a number only when creating", () => {
    const e = errors(validateDrop(form({ nameJa: " ", number: "0" }), ctx()));
    expect(e).toMatchObject({ nameJa: "Required.", number: "A whole number from 1 to 999." });
    const edit = validateDrop(form({ number: "nonsense" }), ctx({ creating: false }));
    expect(edit.ok && edit.value.number).toBe(0);
  });
});
