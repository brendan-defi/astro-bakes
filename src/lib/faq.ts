import type { Locale, Settings } from "./data";
import { yen } from "./format";

/**
 * The FAQ (PRD 1.7): static, bilingual, owner-written; lives in code in v1. Questions follow the PRD's list.
 * Pure module like legal.ts, with the shipping fee and contact address taken from settings.
 */

/** Meta description for link previews and search. */
export const FAQ_DESCRIPTION: Record<Locale, string> = {
  ja: "Astro Bakes のよくある質問。ドロップの時期、東京23区への配送、送料、日持ちと冷凍、アレルゲン、キャンセル、ギフトについて。",
  en: "Answers about Astro Bakes drops: when they open, delivery across Tokyo's 23 wards, shipping, keeping and freezing, allergens, cancellations and gifts.",
};

export interface FaqEntry { id: string; q: string; a: string[] }

const PER_CUSTOMER = 5;

export function faqEntries(locale: Locale, s: Settings): FaqEntry[] {
  const fee = s.shippingFee == null ? null : yen(s.shippingFee);
  if (locale === "ja") {
    return [
      { id: "when", q: "ドロップはいつありますか？", a: ["Astro Bakes は、「ドロップ」と呼ぶ期間限定の予約販売でのみ商品をお届けしています。次のドロップの受付開始日はトップページに表示し、お知らせメールに登録いただいた方には事前にメールでご案内します。", "各ドロップには受付期間とボックスごとの上限数があり、上限に達したボックスは受付期間中でも販売を終了します。"] },
      { id: "where", q: "どこに配達してもらえますか？", a: ["東京23区内のみです。横浜や23区外の市部には、申し訳ありませんが今のところお届けできません。"] },
      { id: "fee", q: "送料はいくらですか？", a: [fee ? `ご注文1回につき ${fee}（税込）の一律料金です。何箱ご注文いただいても変わりません。` : "ご注文1回につき一律の送料がかかります。金額はカート画面に表示します。何箱ご注文いただいても変わりません。"] },
      { id: "delivery", q: "どうやって届きますか？", a: ["各ボックスを個別に箱詰めし、ヤマト運輸でお届けします。ドロップの発送日に全員分を一斉に発送し、原則として翌日にお届けします。発送日とお届け予定日は商品ページとご注文確認メールに記載しています。"] },
      { id: "keep", q: "日持ちしますか？冷凍できますか？", a: ["クッキーは保存料を使っていません。密閉容器に入れて涼しい場所で保存し、お届けから3日以内にお召し上がりいただくのがいちばんおいしい状態です。バナナブレッドは冷蔵で4日ほど保ちます。", "どちらも冷凍できます。1つずつラップで包み、密閉袋に入れて1か月以内を目安にお召し上がりください。冷凍したクッキーはトースターで数分温めると、焼きたてのような食感に戻ります。"] },
      { id: "allergens", q: "アレルゲンについて教えてください", a: ["各ボックスの商品ページに、使用しているアレルゲンを表示しています。", "すべての商品は、小麦・卵・乳・くるみなどを扱う同じ厨房で、同じ器具を使って製造しています。重いアレルギーをお持ちの方は、微量混入の可能性があることをご了承のうえご注文ください。"] },
      { id: "cancel", q: "キャンセルはできますか？", a: ["ドロップの受付締切までは、アカウントページからいつでもキャンセルでき、全額を返金します。受付締切後は、材料の仕込みが始まっているためキャンセルできません。", "商品の破損や未着など当店側の問題があった場合は、受付締切後でも再送または返金で対応します。メールでご連絡ください。"] },
      { id: "limit", q: "ひとりで注文できる数に上限はありますか？", a: [`はい。できるだけ多くの方にお届けするため、お一人様につき各ボックス${PER_CUSTOMER}個までとさせていただいています。`] },
      { id: "date", q: "配達日や時間帯は選べますか？", a: ["選べません。ドロップのすべてのご注文を同じ発送日に発送し、翌日のお届けになります。発送日は商品ページに記載しています。ご不在の場合は、ヤマト運輸の不在連絡票から再配達をご依頼ください。"] },
      { id: "gift", q: "ギフトとして送れますか？", a: ["はい。お届け先に東京23区内であればどなたの住所でも指定でき、ギフトメッセージをカードに印刷して同封します。金額のわかる明細は同封しません。"] },
      { id: "pickup", q: "店頭での受け取りはできますか？", a: ["店舗や受け取り場所はなく、配送のみです。"] },
      { id: "american", q: "「アメリカンスタイル」って、どんなクッキーですか？", a: ["大きくて厚みがあり、外は少しさっくり、中はしっとりやわらかいクッキーです。チョコレートやナッツなどの具材をたっぷり混ぜ込んで、小さなバッチで焼いています。日本でよくある薄くてサクサクしたクッキーとはまったくの別物です。"] },
      { id: "contact", q: "ほかに質問があります", a: [`${s.contactEmail} までお気軽にメールをください。`] },
    ];
  }
  return [
    { id: "when", q: "When are the drops?", a: ["Astro Bakes sells only through drops: limited-time preorders. The next drop's opening date is on the homepage, and if you're on the notify list you'll get an email beforehand.", "Each drop has an ordering period and a cap per box. A box that hits its cap sells out even if the drop is still open."] },
    { id: "where", q: "Where do you deliver?", a: ["Tokyo's 23 wards only. Sorry, not Yokohama, and not the cities west of the wards, for now."] },
    { id: "fee", q: "How much is shipping?", a: [fee ? `One flat fee of ${fee} per order, tax included, however many boxes you order.` : "One flat fee per order, shown in the cart, however many boxes you order."] },
    { id: "delivery", q: "How does it arrive?", a: ["Each box is packed individually and sent by Yamato. Every order in a drop ships together on the drop's ship date and normally arrives the next day. The ship date and expected arrival are on the drop page and in your confirmation email."] },
    { id: "keep", q: "How long do things keep? Can I freeze them?", a: ["The cookies have no preservatives. Keep them in an airtight container somewhere cool and they're at their best within 3 days of delivery. The banana bread keeps about 4 days in the fridge.", "Both freeze well: wrap each piece, bag it, and eat within a month. A few minutes in a toaster oven brings a frozen cookie back to almost fresh-baked."] },
    { id: "allergens", q: "What about allergens?", a: ["Each box lists the allergens it contains on its page.", "Everything is made in one kitchen with shared equipment that handles wheat, eggs, dairy and walnuts, so traces are possible. If you have a serious allergy, please order with that in mind."] },
    { id: "cancel", q: "Can I cancel?", a: ["Until the drop closes, yes: cancel from your account page at any time for a full refund. Once the drop closes we've started on the ingredients, so orders can't be cancelled.", "If something arrives damaged or doesn't arrive at all, that's on us: email and we'll resend or refund, even after the drop has closed."] },
    { id: "limit", q: "Is there a limit per person?", a: [`Yes. So that as many people as possible get a box, each customer can order up to ${PER_CUSTOMER} of each box per drop.`] },
    { id: "date", q: "Can I choose a delivery date or time?", a: ["No. Every order in a drop ships on the same ship date and arrives the next day; the date is on the drop page. If you're out, use Yamato's missed-delivery slip to arrange redelivery."] },
    { id: "gift", q: "Can I send it as a gift?", a: ["Yes. Ship to anyone at an address within the 23 wards, and add a gift message: we print it on a card and tuck it in. Nothing with prices goes in the box."] },
    { id: "pickup", q: "Can I pick up?", a: ["There's no shop or pickup point; it's delivery only."] },
    { id: "american", q: "What's an \"American-style\" cookie?", a: ["Big and thick, with crisp edges and a soft, almost gooey middle, loaded with chocolate and nuts and baked in small batches. Nothing like the thin, crunchy cookies you usually find in Japan."] },
    { id: "contact", q: "I have another question", a: [`Email us at ${s.contactEmail}. We're happy to help.`] },
  ];
}
