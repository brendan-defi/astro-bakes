import { PREFERRED_DAYS_AHEAD, type CustomOrderRequest } from "./custom-order-rules";
import type { Locale } from "./data";
import { getStrings } from "./i18n";

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
}

/** Sent on paid (PRD 3.6): the confirmation screen's content plus the cancellation terms and links. */
export function orderConfirmationEmail(opts: { locale: Locale; order: OrderEmailData }): Email {
  const { locale, order: o } = opts;
  const orderUrl = `${SITE}/${locale}/account/orders/${encodeURIComponent(o.number)}`;
  const legalUrl = `${SITE}/${locale}/legal/tokushoho`;
  const rows = o.lines.map((l) => `<tr><td style="padding:4px 0">${esc(l.name)} × ${l.qty}</td><td style="padding:4px 0;text-align:right">${yen(l.lineTotal)}</td></tr>`).join("");
  const totals = `<tr><td style="padding:8px 0 2px;border-top:1px dashed #2A1B5E">${locale === "ja" ? "小計" : "Subtotal"}</td><td style="padding:8px 0 2px;border-top:1px dashed #2A1B5E;text-align:right">${yen(o.subtotal)}</td></tr>
<tr><td style="padding:2px 0">${locale === "ja" ? "送料" : "Shipping"}</td><td style="padding:2px 0;text-align:right">${yen(o.shippingFee)}</td></tr>
<tr><td style="padding:6px 0;font-weight:900">${locale === "ja" ? "合計（税込）" : "Total (tax incl.)"}</td><td style="padding:6px 0;text-align:right;font-weight:900">${yen(o.total)}</td></tr>`;
  const gift = o.giftMessage ? `<p style="margin:0 0 14px"><strong>${locale === "ja" ? "ギフトメッセージ" : "Gift card"}:</strong> ${esc(o.giftMessage)}</p>` : "";
  if (locale === "ja") {
    const subject = `ご注文ありがとうございます（${o.number}）`;
    const body = `<p style="margin:0 0 14px">ご注文 <strong>${esc(o.number)}</strong> を承りました。</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;font-size:15px">${rows}${totals}</table>
<p style="margin:0 0 6px"><strong>お届け先</strong><br>${esc(o.shipToName)} 様<br>${esc(o.addressLine)}</p>
${gift}
<p style="margin:0 0 14px"><strong>${esc(o.shipDate)}</strong> にヤマト運輸で発送し、<strong>${esc(o.arriveDate)}</strong> にお届け予定です。</p>
<p style="margin:0 0 14px;font-size:14px">キャンセルはドロップ終了（${esc(o.closeDateTime)}）まで無料・全額返金で承ります。終了後はキャンセルできません。</p>
<p style="margin:0 0 6px"><a href="${esc(orderUrl)}" style="font-weight:700">注文を見る</a> · <a href="${esc(legalUrl)}">特定商取引法に基づく表記</a></p>`;
    const text = `ご注文 ${o.number} を承りました。\n\n${o.lines.map((l) => `${l.name} × ${l.qty}  ${yen(l.lineTotal)}`).join("\n")}\n小計 ${yen(o.subtotal)} / 送料 ${yen(o.shippingFee)} / 合計 ${yen(o.total)}\n\nお届け先: ${o.shipToName} 様\n${o.addressLine}\n${o.giftMessage ? `ギフトメッセージ: ${o.giftMessage}\n` : ""}\n${o.shipDate} に発送、${o.arriveDate} にお届け予定です。\nキャンセルはドロップ終了（${o.closeDateTime}）まで無料・全額返金。\n\n注文を見る: ${orderUrl}\n特定商取引法に基づく表記: ${legalUrl}`;
    return { subject, html: layout("ja", subject, body), text };
  }
  const subject = `You're in: order ${o.number}`;
  const body = `<p style="margin:0 0 14px">Order <strong>${esc(o.number)}</strong> is confirmed. Thank you!</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;font-size:15px">${rows}${totals}</table>
<p style="margin:0 0 6px"><strong>Delivering to</strong><br>${esc(o.shipToName)}<br>${esc(o.addressLine)}</p>
${gift}
<p style="margin:0 0 14px">Ships <strong>${esc(o.shipDate)}</strong> by Yamato and arrives <strong>${esc(o.arriveDate)}</strong>.</p>
<p style="margin:0 0 14px;font-size:14px">Cancel free, with a full refund, until the drop closes (${esc(o.closeDateTime)}). After that, orders can't be cancelled.</p>
<p style="margin:0 0 6px"><a href="${esc(orderUrl)}" style="font-weight:700">View your order</a> · <a href="${esc(legalUrl)}">特定商取引法に基づく表記</a></p>`;
  const text = `Order ${o.number} is confirmed. Thank you!\n\n${o.lines.map((l) => `${l.name} × ${l.qty}  ${yen(l.lineTotal)}`).join("\n")}\nSubtotal ${yen(o.subtotal)} / Shipping ${yen(o.shippingFee)} / Total ${yen(o.total)} (tax incl.)\n\nDelivering to ${o.shipToName}\n${o.addressLine}\n${o.giftMessage ? `Gift card: ${o.giftMessage}\n` : ""}\nShips ${o.shipDate} by Yamato, arrives ${o.arriveDate}.\nCancel free, with a full refund, until the drop closes (${o.closeDateTime}).\n\nView your order: ${orderUrl}\n特定商取引法に基づく表記: ${legalUrl}`;
  return { subject, html: layout("en", subject, body), text };
}

/** Sent when the customer (or admin) cancels (PRD 5.3, D22). */
export function orderCancelledEmail(opts: { locale: Locale; number: string; total: number; refunded: boolean }): Email {
  const { locale, number, total, refunded } = opts;
  if (locale === "ja") {
    const subject = `ご注文 ${number} をキャンセルしました`;
    const refundLine = refunded ? `${yen(total)} はお支払い方法へ全額返金されます。反映まで数日かかる場合があります。` : "お支払いは発生していません。";
    const body = `<p style="margin:0 0 14px">ご注文 <strong>${esc(number)}</strong> をキャンセルしました。</p><p style="margin:0 0 14px">${refundLine}</p><p style="margin:0;font-size:14px">またのご注文をお待ちしています。</p>`;
    return { subject, html: layout("ja", subject, body), text: `ご注文 ${number} をキャンセルしました。\n${refundLine}` };
  }
  const subject = `Order ${number} is cancelled`;
  const refundLine = refunded ? `${yen(total)} is being refunded in full to the payment method you used. It can take a few days to show up.` : "Nothing was charged.";
  const body = `<p style="margin:0 0 14px">Order <strong>${esc(number)}</strong> is cancelled.</p><p style="margin:0 0 14px">${refundLine}</p><p style="margin:0;font-size:14px">Hope to see you at the next drop.</p>`;
  return { subject, html: layout("en", subject, body), text: `Order ${number} is cancelled.\n${refundLine}` };
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
