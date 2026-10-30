import { PREFERRED_DAYS_AHEAD, type CustomOrderRequest } from "./custom-order-rules";
import type { Locale } from "./data";
import { getStrings } from "./i18n";
import type { DeliverySlot } from "./delivery-slots";

/**
 * Transactional email copy (PRD 5.3). Plain HTML with a text alternative; no
 * unsubscribe link because these are not marketing emails. The Japanese copy
 * is a working draft until the JA copywriter's pass (handoff p.1).
 */

export interface Email {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(locale: Locale, title: string, body: string): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;padding:24px;background:#FFF5FA;font-family:'Hiragino Maru Gothic ProN',system-ui,sans-serif;color:#2A1B5E;line-height:1.6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:2px solid #2A1B5E;border-radius:20px">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:700;color:#B14FE0">Astro Bakes</td></tr>
<tr><td style="padding:0 28px 28px;font-size:16px">${body}</td></tr>
</table></td></tr></table></body></html>`;
}

export function signInEmail(opts: { locale: Locale; link: string; code: string; minutes: number }): Email {
  const { link, code, minutes } = opts;
  // One word, spaced by letter-spacing rather than spaces, so a double-tap or long-press selects the whole code.
  const codeLine = `<p style="margin:0 0 20px;font-size:30px;font-weight:900;letter-spacing:0.3em">${esc(code)}</p>`;
  if (opts.locale === "ja") {
    const subject = `Astro Bakes ログイン用コード: ${code}`;
    const body = `<p style="margin:0 0 16px">Astro Bakes にログインするには、下のボタンを押すか、画面に次のコードを入力してください。</p>
${codeLine}
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;padding:14px 22px;background:#FF9CCB;color:#2A1B5E;border:2px solid #2A1B5E;border-radius:999px;font-weight:700;text-decoration:none">ログインする</a></p>
<p style="margin:0 0 8px;font-size:14px">リンクとコードは ${minutes} 分で無効になります。一度しか使えません。</p>
<p style="margin:0;font-size:13px;color:#5B3FC4">このメールに心当たりがない場合は、そのまま無視してください。</p>`;
    const text = `Astro Bakes にログイン\n\nコード: ${code}\n\nまたはこのリンクを開いてください:\n${link}\n\nリンクとコードは ${minutes} 分で無効になります。一度しか使えません。心当たりがない場合は無視してください。`;
    return { subject, html: layout("ja", subject, body), text };
  }
  const subject = `Your Astro Bakes sign-in code: ${code}`;
  const body = `<p style="margin:0 0 16px">Tap the button to sign in to Astro Bakes, or type this code on the screen you came from.</p>
${codeLine}
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;padding:14px 22px;background:#FF9CCB;color:#2A1B5E;border:2px solid #2A1B5E;border-radius:999px;font-weight:700;text-decoration:none">Sign in</a></p>
<p style="margin:0 0 8px;font-size:14px">The link and code expire in ${minutes} minutes and work once.</p>
<p style="margin:0;font-size:13px;color:#5B3FC4">Didn't ask for this? You can ignore this email.</p>`;
  const text = `Sign in to Astro Bakes\n\nYour code: ${code}\n\nOr open this link:\n${link}\n\nThe link and code expire in ${minutes} minutes and work once. Didn't ask for this? Ignore this email.`;
  return { subject, html: layout("en", subject, body), text };
}

export interface OwnerOrderEmailData {
  number: string;
  dropName: string;
  lines: { name: string; qty: number }[];
  total: number;
  paymentMethod: string | null;
  shipToName: string;
  /** "目黒区 (Meguro)": where it's going, without the full address. */
  ward: string;
  slot: string;
  giftMessage: string | null;
}

/** "New order" to the owner (PRD 3.6, 4.9 toggle): English, like the admin; enough to know what was bought without opening anything. */
export function ownerNewOrderEmail(o: OwnerOrderEmailData, adminUrl: string): Email {
  const boxes = o.lines.reduce((n, l) => n + l.qty, 0);
  const subject = `New order ${o.number} · ${boxes} box${boxes === 1 ? "" : "es"} · ${yen(o.total)}`;
  const rows: [string, string][] = [
    ["Drop", o.dropName],
    ["Boxes", o.lines.map((l) => `${l.name} × ${l.qty}`).join(", ")],
    ["Total", `${yen(o.total)}${o.paymentMethod ? ` (${o.paymentMethod === "paypay" ? "PayPay" : "card"})` : ""}`],
    ["To", `${o.shipToName}, ${o.ward}`],
    ["Time slot", o.slot],
    ["Gift card", o.giftMessage ?? "None"],
  ];
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:700;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join("");
  const body = `<p style="margin:0 0 14px">A new order just came in.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:15px">${table}</table>
<p style="margin:0 0 8px"><a href="${esc(adminUrl)}" style="color:#2A1B5E;font-weight:700">Open the admin</a></p>
<p style="margin:0;font-size:13px;color:#5B3FC4">Turn these off under Settings → Notifications.</p>`;
  const text = `A new order just came in.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nOpen the admin: ${adminUrl}\nTurn these off under Settings → Notifications.`;
  return { subject, html: layout("en", subject, body), text };
}

/** The admin portal's sign-in (PRD 4, 5.4): English only, like the rest of the admin. */
export function adminSignInEmail(opts: { link: string; code: string; minutes: number }): Email {
  const { link, code, minutes } = opts;
  const subject = `Astro Bakes admin sign-in code: ${code}`;
  const body = `<p style="margin:0 0 16px">Use this code to sign in to the Astro Bakes admin, or open the link in the browser where you asked for it.</p>
<p style="margin:0 0 20px;font-size:30px;font-weight:900;letter-spacing:0.3em">${esc(code)}</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;padding:14px 22px;background:#FF9CCB;color:#2A1B5E;border:2px solid #2A1B5E;border-radius:999px;font-weight:700;text-decoration:none">Sign in to admin</a></p>
<p style="margin:0 0 8px;font-size:14px">The link and code expire in ${minutes} minutes and work once.</p>
<p style="margin:0;font-size:13px;color:#5B3FC4">Didn't ask for this? Someone typed your address on the admin sign-in page. You can ignore this email.</p>`;
  const text = `Sign in to the Astro Bakes admin\n\nYour code: ${code}\n\nOr open this link in the browser where you asked for it:\n${link}\n\nThe link and code expire in ${minutes} minutes and work once. Didn't ask for this? Ignore this email.`;
  return { subject, html: layout("en", subject, body), text };
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://astrobakes.xyz";
const yen = (n: number) => "¥" + n.toLocaleString("en-US");

export interface OrderEmailData {
  number: string;
  lines: { name: string; qty: number; lineTotal: number }[];
  subtotal: number;
  shippingFee: number;
  total: number;
  shipToName: string;
  /** "〒153-0061 東京都目黒区中目黒1-2-3 Room 201" */
  addressLine: string;
  /** Formatted dates in the customer's locale. */
  shipDate: string;
  arriveDate: string;
  closeDateTime: string;
  giftMessage: string | null;
  /** Delivery time slot (D21); "none" reads as no preference. */
  timeSlot: DeliverySlot;
}

/** Sent on paid (PRD 3.6): the confirmation screen's content plus the cancellation terms and links. */
export function orderConfirmationEmail(opts: { locale: Locale; order: OrderEmailData }): Email {
  const { locale, order: o } = opts;
  const slot = getStrings(locale).deliverySlots[o.timeSlot ?? "none"];
  const orderUrl = `${SITE}/${locale}/account/orders/${encodeURIComponent(o.number)}`;
  const legalUrl = `${SITE}/${locale}/legal/tokushoho`;
  const rows = o.lines.map((l) => `<tr><td style="padding:4px 0">${esc(l.name)} × ${l.qty}</td><td style="padding:4px 0;text-align:right">${yen(l.lineTotal)}</td></tr>`).join("");
  const totals = `<tr><td style="padding:8px 0 2px;border-top:1px dashed #2A1B5E">${locale === "ja" ? "小計" : "Subtotal"}</td><td style="padding:8px 0 2px;border-top:1px dashed #2A1B5E;text-align:right">${yen(o.subtotal)}</td></tr>${o.shippingFee > 0 ? `
<tr><td style="padding:2px 0">${locale === "ja" ? "送料" : "Shipping"}</td><td style="padding:2px 0;text-align:right">${yen(o.shippingFee)}</td></tr>` : ""}
<tr><td style="padding:6px 0;font-weight:900">${locale === "ja" ? "合計（税込）" : "Total (tax incl.)"}</td><td style="padding:6px 0;text-align:right;font-weight:900">${yen(o.total)}</td></tr>`;
  const gift = o.giftMessage ? `<p style="margin:0 0 14px"><strong>${locale === "ja" ? "ギフトメッセージ" : "Gift card"}:</strong> ${esc(o.giftMessage)}</p>` : "";
  if (locale === "ja") {
    const subject = `ご注文ありがとうございます（${o.number}）`;
    const body = `<p style="margin:0 0 14px">ご注文 <strong>${esc(o.number)}</strong> を承りました。</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;font-size:15px">${rows}${totals}</table>
<p style="margin:0 0 6px"><strong>お届け先</strong><br>${esc(o.shipToName)} 様<br>${esc(o.addressLine)}</p>
${gift}
<p style="margin:0 0 14px"><strong>${esc(o.shipDate)}</strong> に日本郵便で発送し、<strong>${esc(o.arriveDate)}（${esc(slot)}）</strong> にお届け予定です。お届け時間帯はドロップの受付締切まで注文ページから変更できます。</p>
<p style="margin:0 0 14px;font-size:14px">キャンセルはドロップ終了（${esc(o.closeDateTime)}）まで無料・全額返金で承ります。終了後はキャンセルできません。</p>
<p style="margin:0 0 6px"><a href="${esc(orderUrl)}" style="font-weight:700">注文を見る</a> · <a href="${esc(legalUrl)}">特定商取引法に基づく表記</a></p>`;
    const text = `ご注文 ${o.number} を承りました。\n\n${o.lines.map((l) => `${l.name} × ${l.qty}  ${yen(l.lineTotal)}`).join("\n")}\n小計 ${yen(o.subtotal)}${o.shippingFee > 0 ? ` / 送料 ${yen(o.shippingFee)}` : ""} / 合計 ${yen(o.total)}\n\nお届け先: ${o.shipToName} 様\n${o.addressLine}\n${o.giftMessage ? `ギフトメッセージ: ${o.giftMessage}\n` : ""}\n${o.shipDate} に発送、${o.arriveDate}（${slot}）にお届け予定です。お届け時間帯は受付締切まで注文ページから変更できます。\nキャンセルはドロップ終了（${o.closeDateTime}）まで無料・全額返金。\n\n注文を見る: ${orderUrl}\n特定商取引法に基づく表記: ${legalUrl}`;
    return { subject, html: layout("ja", subject, body), text };
  }
  const subject = `You're in: order ${o.number}`;
  const body = `<p style="margin:0 0 14px">Order <strong>${esc(o.number)}</strong> is confirmed. Thank you!</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;font-size:15px">${rows}${totals}</table>
<p style="margin:0 0 6px"><strong>Delivering to</strong><br>${esc(o.shipToName)}<br>${esc(o.addressLine)}</p>
${gift}
<p style="margin:0 0 14px">Ships <strong>${esc(o.shipDate)}</strong> by Japan Post and arrives <strong>${esc(o.arriveDate)}, ${esc(slot)}</strong>. You can change the delivery time on your order page until the drop closes.</p>
<p style="margin:0 0 14px;font-size:14px">Cancel free, with a full refund, until the drop closes (${esc(o.closeDateTime)}). After that, orders can't be cancelled.</p>
<p style="margin:0 0 6px"><a href="${esc(orderUrl)}" style="font-weight:700">View your order</a> · <a href="${esc(legalUrl)}">特定商取引法に基づく表記</a></p>`;
  const text = `Order ${o.number} is confirmed. Thank you!\n\n${o.lines.map((l) => `${l.name} × ${l.qty}  ${yen(l.lineTotal)}`).join("\n")}\nSubtotal ${yen(o.subtotal)}${o.shippingFee > 0 ? ` / Shipping ${yen(o.shippingFee)}` : ""} / Total ${yen(o.total)} (tax incl.)\n\nDelivering to ${o.shipToName}\n${o.addressLine}\n${o.giftMessage ? `Gift card: ${o.giftMessage}\n` : ""}\nShips ${o.shipDate} by Japan Post, arrives ${o.arriveDate}, ${slot}. You can change the delivery time on your order page until the drop closes.\nCancel free, with a full refund, until the drop closes (${o.closeDateTime}).\n\nView your order: ${orderUrl}\n特定商取引法に基づく表記: ${legalUrl}`;
  return { subject, html: layout("en", subject, body), text };
}

/**
 * What a cancellation means for the customer's money: nothing was paid; this cancellation refunds an amount; or
 * earlier refunds already cover the whole payment, either all issued or with some still on their way (owed until
 * payments are connected). Only an issued refund may be called done.
 */
export type CancelledRefund = { kind: "none" } | { kind: "now"; amount: number } | { kind: "covered"; issued: boolean };

/**
 * Sent when an order is cancelled (PRD 5.3, D22). `byShop` when the shop cancelled it (the order, or its whole drop):
 * it apologises and invites a reply, which reaches the store's contact email.
 */
export function orderCancelledEmail(opts: { locale: Locale; number: string; total: number; refund: CancelledRefund; byShop: boolean }): Email {
  const { locale, number, total, refund, byShop } = opts;
  const n = `<strong>${esc(number)}</strong>`;
  if (locale === "ja") {
    const subject = `ご注文 ${number} をキャンセルしました`;
    const [opening, openingHtml] = byShop
      ? [`申し訳ございません。ご注文 ${number} をキャンセルさせていただきました。`, `申し訳ございません。ご注文 ${n} をキャンセルさせていただきました。`]
      : [`ご注文 ${number} をキャンセルしました。`, `ご注文 ${n} をキャンセルしました。`];
    const refundLine =
      refund.kind === "none" ? "お支払いは発生していません。"
      : refund.kind === "covered" ? (refund.issued ? "お支払いはすでに全額返金済みです。" : "お支払いの全額返金は、すでに手続き中です。反映まで数日かかる場合があります。")
      : `${yen(refund.amount)} はお支払い方法へ${refund.amount === total ? "全額" : ""}返金されます。反映まで数日かかる場合があります。`;
    const closing = byShop ? "ご不明な点は、このメールにご返信ください。" : "またのご注文をお待ちしています。";
    const body = `<p style="margin:0 0 14px">${openingHtml}</p><p style="margin:0 0 14px">${refundLine}</p><p style="margin:0;font-size:14px">${closing}</p>`;
    return { subject, html: layout("ja", subject, body), text: `${opening}\n${refundLine}\n${closing}` };
  }
  const subject = `Order ${number} is cancelled`;
  const [opening, openingHtml] = byShop
    ? [`We're sorry: we've had to cancel order ${number}.`, `We're sorry: we've had to cancel order ${n}.`]
    : [`Order ${number} is cancelled.`, `Order ${n} is cancelled.`];
  const refundLine =
    refund.kind === "none" ? "Nothing was charged."
    : refund.kind === "covered" ? (refund.issued ? "Your payment has already been refunded in full." : "A full refund of your payment is already on its way. It can take a few days to show up.")
    : `${yen(refund.amount)} is being refunded${refund.amount === total ? " in full" : ""} to the payment method you used. It can take a few days to show up.`;
  const closing = byShop ? "If you have any questions, just reply to this email." : "Hope to see you at the next drop.";
  const body = `<p style="margin:0 0 14px">${openingHtml}</p><p style="margin:0 0 14px">${refundLine}</p><p style="margin:0;font-size:14px">${closing}</p>`;
  return { subject, html: layout("en", subject, body), text: `${opening}\n${refundLine}\n${closing}` };
}

export interface ShippedEmailData {
  number: string;
  /** As Japan Post prints it: 1234-5678-9012. */
  tracking: string;
  trackingUrl: string;
  /** The expected arrival, formatted in the customer's locale. */
  arriveDate: string;
  timeSlot: DeliverySlot;
  /** A correction: the number sent before was wrong. */
  corrected?: boolean;
}

/** Sent when the shop marks an order shipped (PRD 3.7, 5.3): the tracking number and Japan Post's link. */
export function orderShippedEmail(opts: { locale: Locale; order: ShippedEmailData }): Email {
  const { locale, order: o } = opts;
  // "No preference" isn't a time, so the arrival is just the day.
  const slot = o.timeSlot === "none" ? null : getStrings(locale).deliverySlots[o.timeSlot];
  const orderUrl = `${SITE}/${locale}/account/orders/${encodeURIComponent(o.number)}`;
  const button = (label: string) => `<p style="margin:0 0 18px"><a href="${esc(o.trackingUrl)}" style="display:inline-block;padding:14px 22px;background:#FF9CCB;color:#2A1B5E;border:2px solid #2A1B5E;border-radius:999px;font-weight:700;text-decoration:none">${label}</a></p>`;
  const number = `<p style="margin:0 0 14px;font-size:20px;font-weight:900;letter-spacing:0.04em">${esc(o.tracking)}</p>`;
  if (locale === "ja") {
    const subject = o.corrected ? `【訂正】お問い合わせ番号のお知らせ（${o.number}）` : `ご注文の品を発送しました（${o.number}）`;
    const opening = o.corrected ? `ご注文 ${o.number} のお問い合わせ番号に誤りがありました。申し訳ございません。正しい番号は次のとおりです。` : `ご注文 ${o.number} を日本郵便で発送しました。`;
    const when = `${o.arriveDate}${slot ? `（${slot}）` : ""}`;
    const arrive = `お届け予定は <strong>${esc(when)}</strong> です。`;
    const arriveText = `お届け予定: ${when}`;
    const body = `<p style="margin:0 0 14px">${esc(opening)}</p>
<p style="margin:0 0 4px;font-size:14px">お問い合わせ番号</p>
${number}
${button("配送状況を確認する")}
<p style="margin:0 0 14px">${arrive}</p>
<p style="margin:0"><a href="${esc(orderUrl)}" style="font-weight:700">注文を見る</a></p>`;
    const text = `${opening}\n\nお問い合わせ番号: ${o.tracking}\n配送状況: ${o.trackingUrl}\n\n${arriveText}\n\n注文を見る: ${orderUrl}`;
    return { subject, html: layout("ja", subject, body), text };
  }
  const subject = o.corrected ? `Corrected tracking number for order ${o.number}` : `Your Astro Bakes box is on its way (${o.number})`;
  const opening = o.corrected ? `Sorry: the tracking number we sent for order ${o.number} was wrong. Here's the right one.` : `Order ${o.number} has left the kitchen and is on its way with Japan Post.`;
  const when = `${o.arriveDate}${slot ? `, ${slot}` : ""}`;
  const arrive = `It should arrive <strong>${esc(when)}</strong>.`;
  const arriveText = `It should arrive ${when}.`;
  const body = `<p style="margin:0 0 14px">${esc(opening)}</p>
<p style="margin:0 0 4px;font-size:14px">Tracking number</p>
${number}
${button("Track it with Japan Post")}
<p style="margin:0 0 14px">${arrive}</p>
<p style="margin:0"><a href="${esc(orderUrl)}" style="font-weight:700">View your order</a></p>`;
  const text = `${opening}\n\nTracking number: ${o.tracking}\nTrack it: ${o.trackingUrl}\n\n${arriveText}\n\nView your order: ${orderUrl}`;
  return { subject, html: layout("en", subject, body), text };
}

/**
 * To the owner when someone sends the custom-orders form. Always English (it's
 * for the owner, and it says which language the customer wrote in); the send sets
 * Reply-To to the customer, so answering is just hitting reply.
 */
export function customOrderRequestEmail(opts: { request: CustomOrderRequest; locale: Locale; noticeDays: number }): Email {
  const { request: r, locale, noticeDays } = opts;
  const en = getStrings("en");
  // A calendar day, not an instant: format it in UTC so no timezone shifts it.
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${r.eventDate}T00:00:00Z`));
  const people = `${en.partySizes[r.partySize]} people`;
  const rows: [string, string][] = [
    ["Name", r.name],
    ["Email", r.email],
    ["Date", day],
    ["Notice", `${noticeDays} days${noticeDays < PREFERRED_DAYS_AHEAD ? " (under two weeks)" : ""}`],
    ["People", people],
    ["Packaging", en.packagings[r.packaging]],
    ["Occasion", r.occasion ? en.occasions[r.occasion] : "Not given"],
    ["Wrote in", locale === "ja" ? "Japanese (日本語)" : "English"],
  ];
  const subject = `Party request: ${day} · ${people} · ${r.name}`;
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:700;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join("");
  const body = `<p style="margin:0 0 14px">New party / custom order request from the website. It isn't an order until you confirm it with them by email.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;font-size:15px">${table}</table>
<p style="margin:0 0 6px;font-weight:700">What they have in mind</p>
<p style="margin:0 0 18px;padding:12px 14px;background:#FFF5FA;border:1px dashed #2A1B5E;border-radius:12px">${esc(r.details).replace(/\n/g, "<br>")}</p>
<p style="margin:0;font-size:14px">Reply to this email to answer ${esc(r.name)} directly. Nothing has been booked or charged.</p>`;
  const text = `New party / custom order request from the website. It isn't an order until you confirm it with them by email.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nWhat they have in mind:\n${r.details}\n\nReply to this email to answer ${r.name} directly. Nothing has been booked or charged.`;
  return { subject, html: layout("en", subject, body), text };
}

/**
 * Sent once when an address joins the drop-email list (PRD 1.5). A plain confirmation, not a promotion, with
 * the way out next to it: anyone added without asking can leave in one click. The footer names the sender,
 * the contact address and the 特商法 page, as 特定電子メール法 asks of mail like this.
 */
export function welcomeEmail(opts: { locale: Locale; unsubscribeUrl: string; senderName: string; contactEmail: string }): Email {
  const { locale, unsubscribeUrl, senderName, contactEmail } = opts;
  const legalUrl = `${SITE}/${locale}/legal/tokushoho`;
  const link = (href: string, label: string) => `<a href="${esc(href)}" style="color:#2A1B5E">${esc(label)}</a>`;
  if (locale === "ja") {
    const subject = "Astro Bakes のお知らせメールに登録しました";
    const body = `<p style="margin:0 0 14px">Astro Bakes のドロップのお知らせに登録しました。次のドロップが決まったときと、受付が始まったときにメールでお知らせします。</p>
<p style="margin:0 0 14px">お知らせはドロップのことだけです。</p>
<p style="margin:0 0 20px;font-size:14px">お心当たりがない場合や、配信を停止したい場合は、こちらからワンクリックで停止できます：${link(unsubscribeUrl, "配信を停止する")}</p>
<p style="margin:0;font-size:12px;color:#5b4f86">送信者：${esc(senderName)}<br>お問い合わせ：${link(`mailto:${contactEmail}`, contactEmail)}<br>${link(legalUrl, "特定商取引法に基づく表記")}</p>`;
    const text = `Astro Bakes のドロップのお知らせに登録しました。次のドロップが決まったときと、受付が始まったときにメールでお知らせします。\nお知らせはドロップのことだけです。\n\nお心当たりがない場合や、配信を停止したい場合は、こちらからワンクリックで停止できます：\n${unsubscribeUrl}\n\n送信者：${senderName}\nお問い合わせ：${contactEmail}\n特定商取引法に基づく表記：${legalUrl}`;
    return { subject, html: layout(locale, subject, body), text };
  }
  const subject = "You're on the Astro Bakes list";
  const body = `<p style="margin:0 0 14px">You're on the list for Astro Bakes drop emails. We'll write when the next drop is announced and again when it opens.</p>
<p style="margin:0 0 14px">That's all we'll email you about: drops.</p>
<p style="margin:0 0 20px;font-size:14px">Didn't sign up, or changed your mind? Unsubscribe in one click: ${link(unsubscribeUrl, "unsubscribe")}</p>
<p style="margin:0;font-size:12px;color:#5b4f86">From ${esc(senderName)}<br>Questions: ${link(`mailto:${contactEmail}`, contactEmail)}<br>${link(legalUrl, "特定商取引法に基づく表記 (commercial disclosure)")}</p>`;
  const text = `You're on the list for Astro Bakes drop emails. We'll write when the next drop is announced and again when it opens.\nThat's all we'll email you about: drops.\n\nDidn't sign up, or changed your mind? Unsubscribe in one click:\n${unsubscribeUrl}\n\nFrom ${senderName}\nQuestions: ${contactEmail}\n特定商取引法に基づく表記: ${legalUrl}`;
  return { subject, html: layout(locale, subject, body), text };
}
