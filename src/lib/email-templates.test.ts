import { describe, expect, it } from "vitest";
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
