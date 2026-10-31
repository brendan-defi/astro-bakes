import { describe, expect, it } from "vitest";
import { orderCancelledEmail, orderConfirmationEmail, orderShippedEmail, welcomeEmail } from "./email-templates";
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

describe("welcomeEmail", () => {
  const opts = { unsubscribeUrl: "https://astrobakes.xyz/en/unsubscribe?e=abc&t=def", senderName: "並川洋美", contactEmail: "hello@astrobakes.xyz" };
  it("confirms the sign-up, puts the one-click way out next to the notice, and names the sender, in both languages", () => {
    const en = welcomeEmail({ locale: "en", ...opts });
    expect(en.text).toContain("Didn't sign up, or changed your mind? Unsubscribe in one click:\nhttps://astrobakes.xyz/en/unsubscribe?e=abc&t=def");
    expect(en.html).toContain('href="https://astrobakes.xyz/en/unsubscribe?e=abc&amp;t=def"');
    expect(en.text).toContain("From 並川洋美");
    expect(en.text).toContain("/en/legal/tokushoho");
    expect(en.text).not.toMatch(/Drop \d|¥/); // a confirmation, not a promotion
    const ja = welcomeEmail({ locale: "ja", ...opts, unsubscribeUrl: "https://astrobakes.xyz/ja/unsubscribe?e=abc&t=def" });
    expect(ja.text).toContain("ワンクリックで停止できます：\nhttps://astrobakes.xyz/ja/unsubscribe?e=abc&t=def");
    expect(ja.text).toContain("送信者：並川洋美");
    expect(ja.html).toContain('lang="ja"');
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

describe("orderCancelledEmail", () => {
  const base = { number: "AB-005-001", total: 2500 };
  const now = (amount: number) => ({ kind: "now", amount }) as const;
  it("tells a customer who cancelled what comes back: all of it, the rest, or nothing paid", () => {
    expect(orderCancelledEmail({ ...base, locale: "en", refund: now(2500), byShop: false }).text).toBe("Order AB-005-001 is cancelled.\n¥2,500 is being refunded in full to the payment method you used. It can take a few days to show up.\nHope to see you at the next drop.");
    expect(orderCancelledEmail({ ...base, locale: "en", refund: now(2000), byShop: false }).text).toContain("¥2,000 is being refunded to the payment method you used.");
    expect(orderCancelledEmail({ ...base, locale: "en", refund: { kind: "none" }, byShop: false }).text).toContain("Nothing was charged.");
    expect(orderCancelledEmail({ ...base, locale: "ja", refund: now(2500), byShop: false }).text).toBe("ご注文 AB-005-001 をキャンセルしました。\n¥2,500 はお支払い方法へ全額返金されます。反映まで数日かかる場合があります。\nまたのご注文をお待ちしています。");
    expect(orderCancelledEmail({ ...base, locale: "ja", refund: now(2000), byShop: false }).text).toContain("¥2,000 はお支払い方法へ返金されます。");
  });

  it("only calls an earlier full refund done once it has been issued; an owed one is on its way", () => {
    const covered = (issued: boolean, locale: "en" | "ja") => orderCancelledEmail({ ...base, locale, refund: { kind: "covered", issued }, byShop: true }).text;
    expect(covered(true, "en")).toContain("Your payment has already been refunded in full.");
    expect(covered(false, "en")).toContain("A full refund of your payment is already on its way. It can take a few days to show up.");
    expect(covered(false, "en")).not.toContain("already been refunded");
    expect(covered(true, "ja")).toContain("お支払いはすでに全額返金済みです。");
    expect(covered(false, "ja")).toContain("お支払いの全額返金は、すでに手続き中です。");
    expect(covered(false, "ja")).not.toContain("返金済み");
  });

  it("apologises when the shop cancelled, and invites a reply, in both languages", () => {
    const en = orderCancelledEmail({ ...base, locale: "en", refund: now(2500), byShop: true });
    expect(en.subject).toBe("Order AB-005-001 is cancelled");
    expect(en.text).toMatch(/^We're sorry: we've had to cancel order AB-005-001\./);
    expect(en.text).toContain("If you have any questions, just reply to this email.");
    expect(en.html).toContain("cancel order <strong>AB-005-001</strong>.");
    const ja = orderCancelledEmail({ ...base, locale: "ja", refund: { kind: "none" }, byShop: true });
    expect(ja.text).toBe("申し訳ございません。ご注文 AB-005-001 をキャンセルさせていただきました。\nお支払いは発生していません。\nご不明な点は、このメールにご返信ください。");
    expect(ja.html).toContain("ご注文 <strong>AB-005-001</strong> をキャンセルさせていただきました。");
  });
});

describe("orderShippedEmail", () => {
  const order = { number: "AB-005-001", tracking: "1234-5678-9012", trackingUrl: "https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=123456789012&searchKind=S002&locale=en", arriveDate: "Fri, Nov 6", timeSlot: "14_16" as const };

  it("gives the tracking number, Japan Post's link and the arrival, in English", () => {
    const e = orderShippedEmail({ locale: "en", order });
    expect(e.subject).toBe("Your Astro Bakes box is on its way (AB-005-001)");
    expect(e.text).toBe(`Order AB-005-001 has left the kitchen and is on its way with Japan Post.\n\nTracking number: 1234-5678-9012\nTrack it: ${order.trackingUrl}\n\nIt should arrive Fri, Nov 6, 14:00–16:00.\n\nView your order: https://astrobakes.xyz/en/account/orders/AB-005-001`);
    expect(e.html).toContain(`href="${order.trackingUrl.replace(/&/g, "&amp;")}"`);
    expect(e.html).toContain(">Track it with Japan Post</a>");
    expect(e.html).toContain('<html lang="en">');
  });

  it("in Japanese", () => {
    const e = orderShippedEmail({ locale: "ja", order: { ...order, arriveDate: "11月6日(金)" } });
    expect(e.subject).toBe("ご注文の品を発送しました（AB-005-001）");
    expect(e.text).toContain("ご注文 AB-005-001 を日本郵便で発送しました。");
    expect(e.text).toContain("お問い合わせ番号: 1234-5678-9012");
    expect(e.text).toContain("お届け予定: 11月6日(金)（14時〜16時）");
    expect(e.html).toContain(">配送状況を確認する</a>");
  });

  it("leaves out a time when the customer has no preference", () => {
    expect(orderShippedEmail({ locale: "en", order: { ...order, timeSlot: "none" } }).text).toContain("It should arrive Fri, Nov 6.\n");
    expect(orderShippedEmail({ locale: "ja", order: { ...order, timeSlot: "none", arriveDate: "11月6日(金)" } }).text).toContain("お届け予定: 11月6日(金)\n");
  });

  it("apologises for a corrected number", () => {
    const en = orderShippedEmail({ locale: "en", order: { ...order, corrected: true } });
    expect(en.subject).toBe("Corrected tracking number for order AB-005-001");
    expect(en.text).toMatch(/^Sorry: the tracking number we sent for order AB-005-001 was wrong. Here's the right one./);
    const ja = orderShippedEmail({ locale: "ja", order: { ...order, corrected: true } });
    expect(ja.subject).toBe("【訂正】お問い合わせ番号のお知らせ（AB-005-001）");
    expect(ja.text).toMatch(/^ご注文 AB-005-001 のお問い合わせ番号に誤りがありました。/);
  });

  it("escapes what it puts in the HTML", () => {
    expect(orderShippedEmail({ locale: "en", order: { ...order, number: "<b>" } }).html).not.toContain("<b>");
  });
});
