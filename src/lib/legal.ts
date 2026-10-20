import type { Locale, Settings } from "./data";
import { yen } from "./format";

/**
 * The three legal pages (PRD 1.8): 特定商取引法に基づく表記, privacy policy, terms. Static copy in both
 * languages, with the 特商法 seller fields and the shipping fee taken from settings (PRD 4.9) so they
 * stay in sync with the checkout. The Japanese text is the authoritative version; English mirrors it.
 * Pure module: no DB, no React, so the content is unit-testable and renderable anywhere.
 */

export const LEGAL_SLUGS = ["tokushoho", "privacy", "terms"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
export const isLegalSlug = (s: string): s is LegalSlug => (LEGAL_SLUGS as readonly string[]).includes(s);

export interface LegalRow { label: string; value: string }
export interface LegalSection { heading?: string; paragraphs?: string[]; bullets?: string[]; rows?: LegalRow[] }
export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  /** When the text last changed; shown under the title. */
  updated: Date;
  /** Shown above the text on the English page: the Japanese version governs. */
  note: string | null;
  sections: LegalSection[];
}

export const LEGAL_UPDATED = new Date("2026-10-20T00:00:00+09:00");
/** Per-customer limit per box per drop (PRD D7); the 特商法 page has to say it plainly. */
const PER_CUSTOMER = 5;

export const LEGAL_TITLES: Record<LegalSlug, Record<Locale, string>> = {
  tokushoho: { ja: "特定商取引法に基づく表記", en: "特定商取引法に基づく表記 · Commercial disclosure" },
  privacy: { ja: "プライバシーポリシー", en: "Privacy policy" },
  terms: { ja: "利用規約", en: "Terms of sale" },
};

const ON_REQUEST = { ja: "請求があったら遅滞なく開示します。", en: "Disclosed without delay on request." };
const JA_GOVERNS = "The Japanese version of this page is the authoritative one; this translation is for convenience.";

export function legalDocument(slug: string, locale: Locale, settings: Settings): LegalDocument | null {
  if (!isLegalSlug(slug)) return null;
  const sections = slug === "tokushoho" ? tokushoho(locale, settings) : slug === "privacy" ? privacy(locale, settings) : terms(locale, settings);
  return { slug, title: LEGAL_TITLES[slug][locale], updated: LEGAL_UPDATED, note: locale === "en" ? JA_GOVERNS : null, sections };
}

// ---------------------------------------------------------------- 特定商取引法に基づく表記

function tokushoho(locale: Locale, s: Settings): LegalSection[] {
  const ja = locale === "ja";
  const fee = s.shippingFee == null
    ? (ja ? "送料：ご注文前のカート画面に表示します（東京23区内一律）。" : "Shipping: shown in the cart before you order (one flat fee across Tokyo's 23 wards).")
    : (ja ? `送料：1回のご注文につき ${yen(s.shippingFee)}（税込・東京23区内一律）。これ以外の料金はかかりません。` : `Shipping: ${yen(s.shippingFee)} per order, tax included, one flat fee across Tokyo's 23 wards. There are no other charges.`);
  const seller = s.legalSellerName.trim()
    || (ja ? `Astro Bakes（個人事業主）\n氏名は${ON_REQUEST.ja}` : `Astro Bakes (sole proprietorship)\nThe proprietor's name is ${ON_REQUEST.en.toLowerCase()}`);
  const rows: LegalRow[] = [
    { label: ja ? "販売業者" : "Seller", value: seller },
    ...(s.legalOperator.trim() ? [{ label: ja ? "運営責任者" : "Head of operations", value: s.legalOperator.trim() }] : []),
    { label: ja ? "所在地" : "Address", value: s.legalAddress.trim() || ON_REQUEST[locale] },
    { label: ja ? "電話番号" : "Phone", value: s.legalPhone.trim() || (ja ? `${ON_REQUEST.ja}\nお問い合わせはメールでお願いします。` : `${ON_REQUEST.en}\nPlease contact us by email.`) },
    { label: ja ? "メールアドレス" : "Email", value: s.contactEmail },
    { label: ja ? "販売価格" : "Prices", value: ja ? "各商品に税込価格で表示しています。" : "Shown on each box, tax included." },
    { label: ja ? "商品代金以外の必要料金" : "Additional fees", value: fee },
    { label: ja ? "支払方法" : "Payment methods", value: ja ? "クレジットカード、PayPay（いずれも Stripe による決済）。" : "Credit card or PayPay, both processed by Stripe." },
    { label: ja ? "支払時期" : "Payment timing", value: ja ? "ご注文時にお支払いいただきます（前払い）。" : "Paid in full when you place the order." },
    { label: ja ? "申込期間" : "Ordering period", value: ja ? "各ドロップ（販売回）の受付期間内のみご注文いただけます。受付期間は商品ページに表示します。" : "Orders are taken only while a drop is open. The dates are shown on the drop page." },
    { label: ja ? "商品の引渡時期" : "Delivery", value: ja ? "各ドロップごとに定める発送日にヤマト運輸で発送し、原則として発送日の翌日にお届けします。発送日は商品ページとご注文確認メールに記載します。お届け日時の指定はできません。" : "Every order in a drop ships by Yamato on that drop's ship date and normally arrives the next day. The ship date is shown on the drop page and in your confirmation email. Delivery dates and times cannot be chosen." },
    { label: ja ? "配送地域" : "Delivery area", value: ja ? "東京23区内のみ。" : "Tokyo's 23 wards only." },
    { label: ja ? "返品・キャンセルについて" : "Returns and cancellations", value: ja
      ? "【お客様都合】ドロップの受付締切までは、アカウントページからいつでもキャンセルでき、全額を返金します。受付締切後のキャンセルはお受けできません。食品のため、お客様都合による返品・交換もお受けしておりません。\n【不良品・未着】商品の破損・品違い・未着の場合は、お届け予定日から3日以内にメールでご連絡ください。当店の負担で再送または全額返金いたします。"
      : "Changed your mind: you can cancel from your account page at any time until the drop closes, for a full refund. After the drop closes, orders cannot be cancelled, and as these are food items we cannot accept returns or exchanges.\nDamaged, wrong or missing items: email us within 3 days of the expected delivery date and we will resend or refund in full at our cost." },
    { label: ja ? "販売数量の制限" : "Quantity limits", value: ja ? `各ボックスにはドロップごとの販売上限数があり、上限に達し次第、販売を終了します。また、お一人様につき各ボックス${PER_CUSTOMER}個までとさせていただきます。` : `Each box has a cap per drop and sells out when it is reached. Each customer may order up to ${PER_CUSTOMER} of each box per drop.` },
  ];
  return [{ rows }];
}

// ---------------------------------------------------------------- Privacy policy

function privacy(locale: Locale, s: Settings): LegalSection[] {
  if (locale === "ja") {
    return [
      { paragraphs: ["Astro Bakes（以下「当店」）は、お客様の個人情報を以下のとおり取り扱います。"] },
      { heading: "取得する情報", paragraphs: ["ご注文とアカウントの利用にあたり、次の情報をお預かりします。"], bullets: ["お名前", "メールアドレス", "電話番号", "お届け先住所（ギフトの場合はお届け先のお名前と住所）", "ご注文履歴", "ギフトメッセージ", "お知らせメールの配信設定"], },
      { paragraphs: ["クレジットカード番号などの決済情報は当店では取得・保存しません。決済は決済代行会社 Stripe が取り扱います。"] },
      { heading: "利用目的", bullets: ["ご注文の受付、商品の発送、ご注文に関するご連絡", "ご注文確認・発送のお知らせなど、取引に必要なメールの送信", "同意いただいた方への、ドロップの告知メールの送信（いつでも配信停止できます）", "不正利用の防止と、法令上の義務の履行"] },
      { heading: "第三者への提供・委託", paragraphs: ["業務に必要な範囲で、次の事業者に情報の取り扱いを委託します。これ以外に、法令に基づく場合を除き、第三者に提供・販売することはありません。"], bullets: ["Stripe（決済処理）", "Resend（メール送信）", "Vercel、Neon（サイトの運用とデータの保管）", "ヤマト運輸（配送：お届け先のお名前・住所・電話番号）"] },
      { heading: "Cookie について", paragraphs: ["ログイン状態とカートの内容を保持するために必要な最小限の Cookie のみを使用します。広告目的の Cookie や Google Analytics などのアクセス解析ツールは使用していません。"] },
      { heading: "保存期間と削除", paragraphs: ["ご注文の記録は、帳簿の保存義務のため法令で定める期間保存します。アカウントの削除をご希望の場合はメールでご連絡ください。アカウントを削除し、保存期間の経過後にご注文記録から個人を特定できる情報を消去します。"] },
      { heading: "開示・訂正・利用停止", paragraphs: ["ご本人からの開示、訂正、利用停止のご請求には、ご本人であることを確認のうえ、遅滞なく対応します。"] },
      { heading: "改定", paragraphs: ["本ポリシーは必要に応じて改定することがあります。改定後の内容は本ページに掲載した時点で効力を生じます。"] },
      { heading: "お問い合わせ", paragraphs: [`個人情報の取り扱いに関するお問い合わせは ${s.contactEmail} までお願いします。`] },
    ];
  }
  return [
    { paragraphs: ["Astro Bakes (\"we\") handles your personal information as described here."] },
    { heading: "What we collect", paragraphs: ["To take and deliver your order, and to run your account, we keep:"], bullets: ["Your name", "Email address", "Phone number", "Delivery address (for gifts, the recipient's name and address)", "Order history", "Gift messages", "Your email notification preference"] },
    { paragraphs: ["We never see or store card numbers or other payment details. Payments are processed by Stripe."] },
    { heading: "Why we use it", bullets: ["To take your order, ship it, and contact you about it", "To send the emails a transaction needs, such as order confirmations and shipping notices", "To tell you about upcoming drops, only if you opted in (you can switch this off at any time)", "To prevent fraud and meet our legal obligations"] },
    { heading: "Who we share it with", paragraphs: ["We pass information to these providers only as far as running the shop requires. We do not otherwise share or sell it, except where the law requires."], bullets: ["Stripe (payment processing)", "Resend (sending email)", "Vercel and Neon (hosting and database)", "Yamato Transport (delivery: the recipient's name, address and phone number)"] },
    { heading: "Cookies", paragraphs: ["We use only the cookies needed to keep you signed in and to remember your cart. There are no advertising cookies and no analytics trackers such as Google Analytics."] },
    { heading: "How long we keep it", paragraphs: ["Order records are kept for the period Japanese bookkeeping law requires. If you would like your account deleted, email us: we delete the account, and once the retention period has passed we remove anything in the order records that identifies you."] },
    { heading: "Access and correction", paragraphs: ["You can ask to see, correct, or stop the use of your information. We will act without delay once we have confirmed it is you."] },
    { heading: "Changes", paragraphs: ["We may update this policy from time to time. Changes take effect when they appear on this page."] },
    { heading: "Contact", paragraphs: [`Questions about your information: ${s.contactEmail}.`] },
  ];
}

// ---------------------------------------------------------------- Terms

function terms(locale: Locale, s: Settings): LegalSection[] {
  if (locale === "ja") {
    return [
      { paragraphs: ["本規約は、Astro Bakes（以下「当店」）のウェブサイトで商品をご注文いただく際に適用されます。ご注文をもって本規約に同意いただいたものとします。"] },
      { heading: "販売の仕組み（ドロップ）", paragraphs: ["当店の商品は、「ドロップ」と呼ぶ期間限定の予約販売でのみ販売します。各ドロップには受付期間、ボックスごとの販売上限数、発送日が定められています。上限数に達したボックスは、受付期間中でも販売を終了します。", `お一人様につき各ボックス${PER_CUSTOMER}個までご注文いただけます。`] },
      { heading: "ご注文と契約の成立", paragraphs: ["注文内容の最終確認画面で「注文を確定」ボタンを押し、お支払いが完了した時点で売買契約が成立します。成立後、ご登録のメールアドレスに注文確認メールをお送りします。"] },
      { heading: "価格と支払い", paragraphs: ["価格はすべて税込で表示します。送料はご注文1回につき一律で、カート画面とご注文前の確認画面に表示します。お支払いはご注文時に、クレジットカードまたは PayPay（Stripe による決済）でお願いします。"] },
      { heading: "配送", paragraphs: ["お届け先は東京23区内に限ります。各ドロップの発送日にヤマト運輸で発送し、原則として翌日にお届けします。お届け日時の指定はできません。ご不在の場合は、配送業者の不在連絡票に従って再配達をご依頼ください。", "ギフトとして、ご自身以外のお届け先を指定することができます。その場合もお届け先は東京23区内に限ります。"] },
      { heading: "キャンセルと返金", paragraphs: ["ドロップの受付締切までは、アカウントページからいつでもキャンセルでき、お支払いいただいた全額をお支払い方法に応じて返金します。受付締切後は、キャンセルおよびお客様都合による返品・交換はお受けできません。", "商品の破損・品違い・未着の場合は、お届け予定日から3日以内にメールでご連絡ください。当店の負担で再送または全額返金いたします。"] },
      { heading: "当店の都合による中止", paragraphs: ["やむを得ない事情により当店がドロップを中止した場合は、ご注文いただいたすべてのお客様に全額を返金し、メールでお知らせします。"] },
      { heading: "商品について", paragraphs: ["商品はすべて手作りのため、形や焼き色に個体差があります。アレルゲン情報は各商品に表示しています。小麦・卵・乳・くるみなどを扱う同じ厨房で製造しているため、微量混入の可能性があることをご了承ください。", "お届け後は、商品に記載または同封の案内に従って保存し、お早めにお召し上がりください。"] },
      { heading: "アカウント", paragraphs: ["ご注文にはメールアドレスによるログインが必要です。正確な情報をご登録いただき、変更があった場合はアカウントページで更新してください。"] },
      { heading: "責任の範囲", paragraphs: ["当店の責任は、当店に故意または重大な過失がある場合を除き、該当するご注文のお支払い金額を上限とします。"] },
      { heading: "準拠法と管轄", paragraphs: ["本規約は日本法に準拠します。本規約に関する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。"] },
      { heading: "規約の変更", paragraphs: ["当店は必要に応じて本規約を変更することがあります。変更後の規約は本ページに掲載した時点で効力を生じ、それ以降のご注文に適用されます。"] },
      { heading: "お問い合わせ", paragraphs: [`本規約に関するお問い合わせは ${s.contactEmail} までお願いします。`] },
    ];
  }
  return [
    { paragraphs: ["These terms apply to orders placed on the Astro Bakes (\"we\") website. By placing an order you agree to them."] },
    { heading: "How drops work", paragraphs: ["We sell only through limited-time preorders called drops. Each drop has an ordering period, a cap per box, and a single ship date. A box that reaches its cap sells out even if the drop is still open.", `Each customer may order up to ${PER_CUSTOMER} of each box per drop.`] },
    { heading: "Placing an order", paragraphs: ["A sale is concluded when you press the \"Place order\" button on the final confirmation screen and your payment succeeds. We then send a confirmation email to the address on your account."] },
    { heading: "Prices and payment", paragraphs: ["All prices include tax. Shipping is one flat fee per order, shown in the cart and on the confirmation screen before you order. Payment is taken when you order, by credit card or PayPay, processed by Stripe."] },
    { heading: "Delivery", paragraphs: ["We deliver within Tokyo's 23 wards only. Every order in a drop ships by Yamato on the drop's ship date and normally arrives the next day. Delivery dates and times cannot be chosen. If nobody is in, please arrange redelivery using the carrier's notice.", "You can send an order as a gift to any address within the 23 wards."] },
    { heading: "Cancellations and refunds", paragraphs: ["Until the drop closes you can cancel from your account page at any time, and we refund the full amount to your original payment method. After the drop closes, orders cannot be cancelled, and as these are food items we cannot accept returns or exchanges.", "If an item arrives damaged, wrong, or not at all, email us within 3 days of the expected delivery date and we will resend or refund in full at our cost."] },
    { heading: "If we have to cancel", paragraphs: ["If we have to cancel a drop for reasons beyond our control, every order is refunded in full and we let you know by email."] },
    { heading: "About the products", paragraphs: ["Everything is made by hand, so shapes and colours vary. Allergens are listed on each box. Everything is made in one kitchen that handles wheat, eggs, dairy and walnuts, so traces are possible.", "After delivery, please store as described on the packaging or the enclosed note, and enjoy soon."] },
    { heading: "Your account", paragraphs: ["Ordering requires signing in with your email address. Please keep your details accurate and update them on your account page when they change."] },
    { heading: "Limitation of liability", paragraphs: ["Except in cases of wilful misconduct or gross negligence on our part, our liability is limited to the amount you paid for the order concerned."] },
    { heading: "Governing law", paragraphs: ["These terms are governed by the laws of Japan. Any dispute is subject to the exclusive jurisdiction of the Tokyo District Court in the first instance."] },
    { heading: "Changes to these terms", paragraphs: ["We may change these terms when needed. Changes take effect when they appear on this page and apply to orders placed afterwards."] },
    { heading: "Contact", paragraphs: [`Questions about these terms: ${s.contactEmail}.`] },
  ];
}
