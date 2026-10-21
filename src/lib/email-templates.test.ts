import { describe, expect, it } from "vitest";
import { orderConfirmationEmail } from "./email-templates";
import { customOrderRequestEmail, signInEmail } from "./email-templates";

describe("signInEmail", () => {
  const link = "https://astrobakes.xyz/en/auth/verify?token=abc";
  it("carries the code and the link in both html and text, in both languages", () => {
    for (const locale of ["en", "ja"] as const) {
      const m = signInEmail({ locale, link, code: "042599", minutes: 15 });
      expect(m.subject).toContain("042599");
      expect(m.html).toContain(link);
      expect(m.html).toContain(">042599</p>"); // one word, so one tap copies all of it
      expect(m.text).toContain("042599");
      expect(m.text).toContain(link);
      expect(m.html).toContain(`lang="${locale}"`);
      expect(m.html).not.toMatch(/unsubscribe/i);
    }
  });
  it("escapes html in the link", () => {
    const m = signInEmail({ locale: "en", link: 'https://x/?a=1&b="2"', code: "000000", minutes: 15 });
    expect(m.html).toContain("https://x/?a=1&amp;b=&quot;2&quot;");
  });
});

describe("customOrderRequestEmail", () => {
  const request = { name: "Hanako <b>", email: "hanako@example.com", eventDate: "2026-11-14", partySize: "20to50" as const, packaging: "unsealed" as const, occasion: "office" as const, details: "Half matcha.\nNo nuts <script>" };
  it("gives the owner the date, size and who it's from at a glance, in English", () => {
    const m = customOrderRequestEmail({ request, locale: "ja", noticeDays: 25 });
    expect(m.subject).toBe("Party request: Sat, Nov 14, 2026 · 20–50 people · Hanako <b>");
    expect(m.text).toContain("Notice: 25 days\n");
    expect(m.text).toContain("It isn't an order until you confirm it");
    expect(m.text).toContain("Occasion: Office or team");
    expect(m.text).toContain("Packaging: Party-ready (unsealed)");
    expect(m.text).toContain("Wrote in: Japanese (日本語)");
    expect(m.text).toContain("Half matcha.\nNo nuts <script>");
    expect(m.html).toContain('lang="en"');
  });
  it("escapes what the customer typed and keeps their line breaks", () => {
    const m = customOrderRequestEmail({ request, locale: "en", noticeDays: 25 });
    expect(m.html).toContain("Half matcha.<br>No nuts &lt;script&gt;");
    expect(m.html).toContain("Hanako &lt;b&gt;");
    expect(m.html).not.toContain("<script>");
  });
  it("says when no occasion was given", () => {
    expect(customOrderRequestEmail({ request: { ...request, occasion: null }, locale: "en", noticeDays: 25 }).text).toContain("Occasion: Not given");
  });
  it("flags requests with under two weeks' notice", () => {
    expect(customOrderRequestEmail({ request, locale: "en", noticeDays: 13 }).text).toContain("Notice: 13 days (under two weeks)");
    expect(customOrderRequestEmail({ request, locale: "en", noticeDays: 14 }).text).toContain("Notice: 14 days\n");
  });
});

describe("orderConfirmationEmail", () => {
  const order = { number: "AB-003-017", lines: [{ name: "4 Cookie Box", qty: 2, lineTotal: 2000 }], subtotal: 2000, shippingFee: 0, total: 2000, shipToName: "Hanako", addressLine: "〒153-0061 東京都目黒区中目黒1-2-3", shipDate: "Sun, Oct 25", arriveDate: "Mon, Oct 26", closeDateTime: "Sun, Oct 18 · 21:00 JST", giftMessage: null, timeSlot: "none" as const };
  it("leaves the shipping line out when shipping is included, and names Japan Post", () => {
    const en = orderConfirmationEmail({ locale: "en", order });
    expect(en.html).not.toContain("Shipping");
    expect(en.text).toContain("Subtotal ¥2,000 / Total ¥2,000");
    expect(en.text).toContain("by Japan Post");
    expect(en.text).not.toContain("Yamato");
    const ja = orderConfirmationEmail({ locale: "ja", order });
    expect(ja.html).not.toContain("送料");
    expect(ja.text).toContain("小計 ¥2,000 / 合計 ¥2,000");
    expect(ja.html).toContain("日本郵便");
    expect(ja.html).not.toContain("ヤマト");
  });
  it("states the delivery time slot and how to change it, in both languages", () => {
    const en = orderConfirmationEmail({ locale: "en", order: { ...order, timeSlot: "14_16" } });
    expect(en.html).toContain("Mon, Oct 26, 14:00–16:00");
    expect(en.text).toContain("arrives Mon, Oct 26, 14:00–16:00");
    expect(en.text).toContain("change the delivery time on your order page until the drop closes");
    const ja = orderConfirmationEmail({ locale: "ja", order: { ...order, timeSlot: "morning" } });
    expect(ja.html).toContain("Mon, Oct 26（午前中）");
    expect(ja.text).toContain("（午前中）にお届け予定");
    expect(orderConfirmationEmail({ locale: "en", order }).text).toContain("arrives Mon, Oct 26, No preference");
    expect(orderConfirmationEmail({ locale: "ja", order }).text).toContain("（希望なし）");
  });
  it("still shows a fee when one is set", () => {
    const en = orderConfirmationEmail({ locale: "en", order: { ...order, shippingFee: 800, total: 2800 } });
    expect(en.html).toContain("Shipping");
    expect(en.text).toContain("Subtotal ¥2,000 / Shipping ¥800 / Total ¥2,800");
  });
});
