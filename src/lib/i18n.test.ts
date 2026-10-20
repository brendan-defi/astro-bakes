import { describe, expect, it } from "vitest";
import { getStrings, type Strings } from "./i18n";
import { fmtDateTime, fmtTickerDate, fmtTickerDateTime, fmtTickerDay } from "./format";

const en = getStrings("en");
const ja = getStrings("ja");
const keys = Object.keys(en) as (keyof Strings)[];

/** Identical in both languages on purpose: Japanese-only on the EN page too (tagline, 税込, legal page titles, the address example) or a brand name. */
const SAME = new Set<keyof Strings>(["heroTagline", "taxIncl", "tokushoho", "privacy", "terms", "buildingPlaceholder", "instagram", "line", "copyright", "paypay"]);
/** Helpers that transform data rather than carry copy; tested on their own below. */
const HELPERS = new Set<keyof Strings>(["allergen", "boxNames", "tickerSentence"]);

/** A string, or a template filled with placeholder arguments. */
function render(s: Strings, k: keyof Strings): string {
  const v = s[k] as unknown;
  return typeof v === "function" ? (v as (...a: string[]) => string)(...Array<string>(v.length).fill("2")) : (v as string);
}

/** Hiragana, katakana or kanji. */
const JAPANESE = /[\u3040-\u30ff\u4e00-\u9fff]/;

describe("Japanese strings", () => {
  it("translates every string that isn't shared on purpose", () => {
    const untranslated = keys.filter((k) => !SAME.has(k) && !HELPERS.has(k) && (render(ja, k) === render(en, k) || !JAPANESE.test(render(ja, k))));
    expect(untranslated).toEqual([]);
  });

  it("keeps the shared strings shared", () => {
    for (const k of SAME) expect(render(ja, k)).toBe(render(en, k));
  });

  it("joins the ticker into Japanese sentences", () => {
    expect(ja.tickerSentence(["ドロップお休み中", "東京23区限定"])).toBe("ドロップお休み中。東京23区限定。");
    expect(en.tickerSentence(["BETWEEN DROPS", "TOKYO 23 WARDS"])).toBe("BETWEEN DROPS. TOKYO 23 WARDS.");
  });

  it("says today and tomorrow in the ticker status instead of 0 or 1 days", () => {
    expect(en.tickerStatus(3, 1, "OCT 25")).toBe("Drop 03 is open. Closes tomorrow. Ships OCT 25.");
    expect(en.tickerStatus(3, 4, "OCT 25")).toBe("Drop 03 is open. Closes in 4 days. Ships OCT 25.");
    expect(ja.tickerStatus(3, 0, "10月25日")).toBe("ドロップ03受付中。本日締切。10月25日発送。");
  });

  it("reads the opening hour naturally in the speech bubble", () => {
    expect(ja.bubbleScheduled("日曜日", "10")).toBe("日曜日の10時オープン！");
    expect(ja.bubbleScheduled("日曜日", "10:30")).toBe("日曜日の10:30オープン！");
  });

  it("labels allergens in Japanese and passes unknown ones through", () => {
    expect(["Egg", "Milk", "Wheat", "Walnut"].map(ja.allergen)).toEqual(["卵", "乳", "小麦", "くるみ"]);
    expect(ja.allergen("Lupin")).toBe("Lupin");
    expect(en.allergen("Egg")).toBe("Egg");
  });

  it("only pluralises box names in English", () => {
    expect(en.boxNames("4 Cookie Box")).toBe("4 Cookie Boxes");
    expect(en.boxNames("Nebula Banana Bread")).toBe("Nebula Banana Bread");
    expect(ja.boxNames("4種のクッキーボックス")).toBe("4種のクッキーボックス");
  });
});

describe("dates", () => {
  const ship = new Date("2026-10-25T00:00:00+09:00");
  const open = new Date("2026-11-08T10:00:00+09:00");

  it("formats in English caps by default", () => {
    expect(fmtTickerDate(ship)).toBe("OCT 25");
    expect(fmtTickerDay(ship)).toBe("SUN OCT 25");
    expect(fmtTickerDateTime(open)).toBe("SUN NOV 8, 10:00 JST");
  });

  it("formats Japanese dates with the weekday, in JST", () => {
    expect(fmtDateTime(open, "ja")).toBe("11月8日(日) 10:00");
    expect(fmtDateTime(open)).toBe("Sun, Nov 8 · 10:00 JST");
    expect(fmtTickerDate(ship, "ja")).toBe("10月25日");
    expect(fmtTickerDay(ship, "ja")).toBe("10月25日(日)");
    expect(fmtTickerDateTime(open, "ja")).toBe("11月8日(日) 10:00");
  });
});
