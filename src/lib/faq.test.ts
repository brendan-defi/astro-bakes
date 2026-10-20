import { describe, expect, it } from "vitest";
import { settings as base } from "./data";
import { faqEntries } from "./faq";

const JAPANESE = /[぀-ヿ一-鿿]/;
/** The questions PRD 1.7 says the page must cover. */
const REQUIRED = ["when", "where", "fee", "delivery", "keep", "allergens", "cancel", "limit", "date", "gift", "pickup", "american"];

describe("FAQ", () => {
  it("covers every question in the PRD, in the same order in both languages", () => {
    const ja = faqEntries("ja", base).map((e) => e.id);
    const en = faqEntries("en", base).map((e) => e.id);
    expect(ja).toEqual(en);
    for (const id of REQUIRED) expect(ja).toContain(id);
  });

  it("is Japanese throughout on the Japanese page and English on the English page", () => {
    const text = (locale: "ja" | "en") => faqEntries(locale, base).flatMap((e) => [e.q, ...e.a]);
    expect(text("ja").filter((t) => !JAPANESE.test(t))).toEqual([]);
    expect(text("en").filter((t) => JAPANESE.test(t))).toEqual([]);
  });

  it("takes the shipping fee and contact address from settings", () => {
    const fee = (locale: "ja" | "en", shippingFee: number | null) => faqEntries(locale, { ...base, shippingFee }).find((e) => e.id === "fee")!.a.join(" ");
    expect(fee("ja", 800)).toContain("¥800");
    expect(fee("en", 800)).toContain("¥800");
    expect(fee("en", null)).toContain("shown in the cart");
    expect(fee("ja", null)).toContain("カート画面");
    const contact = (locale: "ja" | "en") => faqEntries(locale, { ...base, contactEmail: "owner@example.com" }).find((e) => e.id === "contact")!.a.join(" ");
    expect(contact("ja")).toContain("owner@example.com");
    expect(contact("en")).toContain("owner@example.com");
  });

  it("gives the PRD's answers: 23 wards, no pickup, no date choice, 5 per box, cancel until close", () => {
    const en = Object.fromEntries(faqEntries("en", base).map((e) => [e.id, e.a.join(" ")]));
    expect(en.where).toMatch(/23 wards/);
    expect(en.where).toMatch(/not Yokohama/);
    expect(en.pickup).toMatch(/delivery only/);
    expect(en.date).toMatch(/^No\./);
    expect(en.limit).toContain("up to 5 of each box");
    expect(en.cancel).toMatch(/Until the drop closes, yes/);
  });
});
