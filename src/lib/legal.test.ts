import { describe, expect, it } from "vitest";
import { settings as base } from "./data";
import { LEGAL_SLUGS, isLegalSlug, legalDocument, type LegalDocument } from "./legal";

const JAPANESE = /[぀-ヿ一-鿿]/;
const allText = (d: LegalDocument) => d.sections.flatMap((s) => [s.heading ?? "", ...(s.paragraphs ?? []), ...(s.bullets ?? []), ...(s.rows ?? []).flatMap((r) => [r.label, r.value])]).filter(Boolean);
const row = (d: LegalDocument, label: string) => d.sections[0].rows!.find((r) => r.label === label)?.value;

describe("legal pages", () => {
  it("knows exactly three pages and rejects anything else", () => {
    expect(LEGAL_SLUGS).toEqual(["tokushoho", "privacy", "terms"]);
    expect(isLegalSlug("faq")).toBe(false);
    expect(legalDocument("faq", "en", base)).toBeNull();
  });

  it("renders the owner's 特商法 fields from settings", () => {
    const d = legalDocument("tokushoho", "ja", { ...base, legalSellerName: "山田 花子", legalOperator: "山田 花子", legalAddress: "東京都目黒区中目黒1-2-3", legalPhone: "03-1234-5678" })!;
    expect(row(d, "販売業者")).toBe("山田 花子");
    expect(row(d, "運営責任者")).toBe("山田 花子");
    expect(row(d, "所在地")).toBe("東京都目黒区中目黒1-2-3");
    expect(row(d, "電話番号")).toBe("03-1234-5678");
    expect(row(d, "メールアドレス")).toBe(base.contactEmail);
  });

  it("falls back to the sole-proprietor 'disclosed on request' wording when the fields are empty", () => {
    const d = legalDocument("tokushoho", "ja", base)!;
    expect(row(d, "販売業者")).toContain("Astro Bakes");
    expect(row(d, "販売業者")).toContain("請求があったら遅滞なく開示します");
    expect(row(d, "所在地")).toBe("請求があったら遅滞なく開示します。");
    expect(row(d, "電話番号")).toContain("請求があったら遅滞なく開示します");
    expect(row(d, "運営責任者")).toBeUndefined(); // no row rather than an empty one
    const en = legalDocument("tokushoho", "en", base)!;
    expect(row(en, "Address")).toBe("Disclosed without delay on request.");
  });

  it("shows the shipping fee from settings, or where to find it when unset", () => {
    expect(row(legalDocument("tokushoho", "ja", { ...base, shippingFee: 800 })!, "商品代金以外の必要料金")).toContain("¥800");
    expect(row(legalDocument("tokushoho", "en", { ...base, shippingFee: 800 })!, "Additional fees")).toContain("¥800");
    expect(row(legalDocument("tokushoho", "ja", { ...base, shippingFee: null })!, "商品代金以外の必要料金")).toContain("カート画面");
  });

  it("states the cancellation policy (D22) and the per-customer limit plainly", () => {
    const ja = legalDocument("tokushoho", "ja", base)!;
    expect(row(ja, "返品・キャンセルについて")).toMatch(/受付締切まで.*全額を返金/);
    expect(row(ja, "販売数量の制限")).toContain("5個まで");
    const en = legalDocument("tokushoho", "en", base)!;
    expect(row(en, "Returns and cancellations")).toMatch(/until the drop closes, for a full refund/);
    expect(row(en, "Quantity limits")).toContain("up to 5 of each box");
  });

  it("has Japanese text throughout the Japanese pages, none on the English pages, and the contact email on all of them", () => {
    const notEmail = (t: string) => t !== base.contactEmail;
    for (const slug of LEGAL_SLUGS) {
      const ja = legalDocument(slug, "ja", base)!;
      const en = legalDocument(slug, "en", base)!;
      expect(allText(ja).filter(notEmail).filter((t) => !JAPANESE.test(t))).toEqual([]);
      expect(allText(en).filter((t) => JAPANESE.test(t))).toEqual([]);
      expect(allText(ja).join("\n")).toContain(base.contactEmail);
      expect(allText(en).join("\n")).toContain(base.contactEmail);
      expect(ja.note).toBeNull();
      expect(en.note).toMatch(/Japanese version/);
      expect(ja.updated).toEqual(en.updated);
    }
  });
});
