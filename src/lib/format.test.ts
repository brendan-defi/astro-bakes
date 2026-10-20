import { describe, expect, it } from "vitest";
import { daysUntil, fmtDateTime, fmtTickerDate, fmtTickerDateTime, fmtTickerDay } from "./format";

const JST = (iso: string) => new Date(`${iso}+09:00`);

describe("daysUntil", () => {
  // Drop 04 closes Sun Nov 15 at 21:00 JST.
  const close = JST("2026-11-15T21:00:00");

  it("is 0 all through the closing day, up to the close", () => {
    expect(daysUntil(close, JST("2026-11-15T00:00:00"))).toBe(0);
    expect(daysUntil(close, JST("2026-11-15T10:00:00"))).toBe(0);
    expect(daysUntil(close, JST("2026-11-15T20:59:59"))).toBe(0);
  });

  it("is 1 the day before, whether more or less than 24 hours remain", () => {
    expect(daysUntil(close, JST("2026-11-14T08:00:00"))).toBe(1); // 37 hours
    expect(daysUntil(close, JST("2026-11-14T22:00:00"))).toBe(1); // 23 hours
    expect(daysUntil(close, JST("2026-11-14T23:59:59"))).toBe(1);
  });

  it("turns over at midnight in Tokyo, not UTC", () => {
    // 23:30 UTC on the 14th is 08:30 on the 15th in Tokyo.
    expect(daysUntil(close, new Date("2026-11-14T23:30:00Z"))).toBe(0);
    // 14:59 UTC on the 14th is still the 14th in Tokyo; a minute later it's the 15th.
    expect(daysUntil(close, new Date("2026-11-14T14:59:00Z"))).toBe(1);
    expect(daysUntil(close, new Date("2026-11-14T15:00:00Z"))).toBe(0);
  });

  it("counts calendar days further out, and never goes negative", () => {
    expect(daysUntil(close, JST("2026-11-12T22:00:00"))).toBe(3);
    expect(daysUntil(close, JST("2026-11-16T09:00:00"))).toBe(0);
  });
});

describe("dates", () => {
  const ship = JST("2026-10-25T00:00:00");
  const open = JST("2026-11-08T10:00:00");

  it("formats English with the weekday in JST", () => {
    expect(fmtDateTime(open)).toBe("Sun, Nov 8 · 10:00 JST");
    expect(fmtTickerDate(ship)).toBe("OCT 25");
    expect(fmtTickerDay(ship)).toBe("SUN OCT 25");
    expect(fmtTickerDateTime(open)).toBe("SUN NOV 8, 10:00 JST");
  });

  it("formats Japanese as in the handoff: 「11月8日(日) 10:00」", () => {
    expect(fmtDateTime(open, "ja")).toBe("11月8日(日) 10:00");
    expect(fmtTickerDate(ship, "ja")).toBe("10月25日");
    expect(fmtTickerDay(ship, "ja")).toBe("10月25日(日)");
    expect(fmtTickerDateTime(open, "ja")).toBe("11月8日(日) 10:00");
  });
});
