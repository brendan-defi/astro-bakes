import { describe, expect, it } from "vitest";
import { lookupPostal, normalisePostal, outsideWards } from "./postal";
import { CODES, WARDS } from "./postal-tokyo23";

describe("lookupPostal", () => {
  it("finds real addresses across the 23 wards, not just a sample list", () => {
    // The bug report: 153-0062 (Mita, Meguro-ku) came back "not found".
    expect(lookupPostal("1530062")).toEqual({ prefecture: "東京都", city: "目黒区", town: "三田", wardEn: "Meguro-ku", wardCode: "13110", deliverable: true });
    expect(lookupPostal("153-0062")?.town).toBe("三田");
    expect(lookupPostal("１５３－００６２")?.town).toBe("三田");
    expect(lookupPostal("1530061")).toMatchObject({ city: "目黒区", town: "中目黒" });
    expect(lookupPostal("1500001")).toMatchObject({ city: "渋谷区", town: "神宮前", wardCode: "13113" });
    expect(lookupPostal("1320013")).toMatchObject({ city: "江戸川区", town: "江戸川", wardEn: "Edogawa-ku" });
  });

  it("covers every ward", () => {
    const wards = new Set(Object.values(CODES).map(([w]) => w));
    expect(wards.size).toBe(23);
    expect(WARDS.map(([code]) => code)).toEqual(Array.from({ length: 23 }, (_, i) => String(13101 + i)));
  });

  it("drops Japan Post's notes from the neighbourhood name", () => {
    expect(lookupPostal("1050014")?.town).toBe("芝"); // 芝（１〜３丁目）
    expect(lookupPostal("1000004")?.town).toBe("大手町"); // 大手町（次のビルを除く）
  });

  it("resolves a skyscraper's per-floor codes to its neighbourhood", () => {
    expect(lookupPostal("1006810")).toMatchObject({ city: "千代田区", town: "大手町" }); // 大手町ＪＡビル（１０階）
    expect(lookupPostal("1006890")).toMatchObject({ city: "千代田区", town: "大手町" }); // 地階・階層不明
  });

  it("treats a ward's catch-all code as not found, since it carries no neighbourhood for the label", () => {
    expect(lookupPostal("1530000")).toBeNull();
  });

  it("finds nothing outside the 23 wards or for a malformed code", () => {
    expect(lookupPostal("1800004")).toBeNull(); // Musashino
    expect(lookupPostal("2310001")).toBeNull(); // Yokohama
    expect(lookupPostal("153006")).toBeNull();
    expect(lookupPostal("")).toBeNull();
  });
});

describe("outsideWards", () => {
  it("is true when the code's area has no addresses in the 23 wards", () => {
    expect(outsideWards("180-0004")).toBe(true); // Musashino
    expect(outsideWards("231-0001")).toBe(true); // Yokohama
    expect(outsideWards("999-9999")).toBe(true);
  });

  it("is false inside a ward area, so a typo there reads as not found", () => {
    expect(outsideWards("153-0099")).toBe(false);
    expect(outsideWards("153-0062")).toBe(false);
  });

  it("only judges complete codes", () => {
    expect(outsideWards("23100")).toBe(false);
  });
});

describe("normalisePostal", () => {
  it("keeps the digits, half-width", () => {
    expect(normalisePostal("〒153-0062")).toBe("1530062");
    expect(normalisePostal("１５３ ００６２")).toBe("1530062");
  });
});
