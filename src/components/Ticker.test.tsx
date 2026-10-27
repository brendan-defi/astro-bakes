import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousViewer, drops, settings, type HomeData, type Locale } from "@/lib/data";
import { Ticker } from "./Ticker";

const JST = (iso: string) => new Date(`${iso}+09:00`);

// Drop 04 (sample data) closes Sun Nov 15 at 21:00 JST and ships Sun Nov 22.
const drop = drops[1];
const home: HomeData = { state: "open", drop, nextDrop: null, boxes: drop.boxes, viewer: anonymousViewer, settings, soldOut: false };

/** The ticker's screen-reader sentence at a given moment. */
function statusAt(now: Date, locale: Locale = "en") {
  vi.setSystemTime(now);
  render(<Ticker locale={locale} home={home} />);
  const label = screen.getByRole("status").getAttribute("aria-label");
  cleanup();
  return label;
}

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

describe("Ticker on an open drop", () => {
  it("says the drop closes today on the closing day, right up to the close", () => {
    expect(statusAt(JST("2026-11-15T10:00:00"))).toBe("Drop 04 is open. Closes today. Ships NOV 22.");
    expect(statusAt(JST("2026-11-15T20:59:59"))).toBe("Drop 04 is open. Closes today. Ships NOV 22.");
    expect(statusAt(JST("2026-11-15T10:00:00"), "ja")).toBe("ドロップ04受付中。本日締切。11月22日発送。");

    vi.setSystemTime(JST("2026-11-15T10:00:00"));
    render(<Ticker locale="en" home={home} />);
    expect(screen.getAllByText("CLOSES TODAY").length).toBeGreaterThan(0);
    expect(screen.queryByText("CLOSES TOMORROW")).toBeNull();
    cleanup();
  });

  it("says tomorrow the day before, however many hours are left", () => {
    expect(statusAt(JST("2026-11-14T08:00:00"))).toBe("Drop 04 is open. Closes tomorrow. Ships NOV 22.");
    expect(statusAt(JST("2026-11-14T22:00:00"))).toBe("Drop 04 is open. Closes tomorrow. Ships NOV 22.");
    expect(statusAt(JST("2026-11-14T22:00:00"), "ja")).toBe("ドロップ04受付中。明日締切。11月22日発送。");
  });

  it("turns over at midnight in Tokyo, not at midnight UTC", () => {
    expect(statusAt(JST("2026-11-14T23:59:59"))).toBe("Drop 04 is open. Closes tomorrow. Ships NOV 22.");
    expect(statusAt(JST("2026-11-15T00:00:00"))).toBe("Drop 04 is open. Closes today. Ships NOV 22.");
    // Still the 14th in UTC, already the 15th in Tokyo.
    expect(statusAt(new Date("2026-11-14T23:30:00Z"))).toBe("Drop 04 is open. Closes today. Ships NOV 22.");
  });

  it("counts calendar days further out", () => {
    expect(statusAt(JST("2026-11-12T22:00:00"))).toBe("Drop 04 is open. Closes in 3 days. Ships NOV 22.");
  });
});

describe("Ticker on a sold-out drop (D9: open until it closes)", () => {
  it("says sold out instead of open, and get notified instead of the ship date", () => {
    vi.setSystemTime(JST("2026-11-13T10:00:00"));
    render(<Ticker locale="en" home={{ ...home, soldOut: true }} />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Drop 04 is sold out. Closes in 2 days. Get notified for the next one.");
    expect(screen.getByRole("status").textContent).toContain("DROP 04 SOLD OUT");
    expect(screen.getByRole("status").textContent).not.toContain("SHIPS");
    cleanup();
    render(<Ticker locale="ja" home={{ ...home, soldOut: true }} />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("ドロップ04は完売しました。締切まであと2日。次回のお知らせを受け取れます。");
  });
});
