import iconv from "iconv-lite";
import { japanPostSlotCode, type DeliverySlot } from "./delivery-slots";
import { normalisePhone } from "./phone";

/**
 * The label file for Japan Post's Webゆうパックプリント (PRD 4.6, D21): its 出荷予定データ(標準フォーマット) CSV, one row per
 * parcel, exactly 72 columns, no header row, CRLF, Shift_JIS (CP932). The owner uploads it to print the labels. The
 * layout follows Japan Post's manual (post.japanpost.jp/web-yu-packprint/contents/manual/Web_upload.html) and its
 * sample file, which also sets the option columns explicitly. Pure apart from the encoding, so it's unit tested;
 * fulfilment.ts gathers the orders and the route serves the file.
 *
 * Nothing is ever truncated or dropped quietly: a name too long for the label, a character the file can't carry, or
 * one the label printer may draw wrongly is reported with the order, for the owner to fix in the tool.
 */

export const JP_COLUMNS = 72;
/** Webゆうパックプリント takes at most this many rows per file. */
export const JP_MAX_ROWS = 1000;

/** 1-based column numbers in the 標準フォーマット (the manual's numbering). */
export const JP_COL = {
  kind: 1, // 商品: 1 ゆうパック
  payment: 2, // 着払/代引: 0 元払 (the sender pays)
  labels: 7, // 作成数: labels to print for the row
  toName: 8,
  toHonorific: 9,
  toPostal: 11,
  toPrefecture: 12,
  toCity: 13,
  toLine1: 14,
  toLine2: 15,
  toPhone: 16,
  fromName: 23,
  fromPostal: 26,
  fromPrefecture: 27,
  fromCity: 28,
  fromLine1: 29,
  fromLine2: 30,
  fromPhone: 31,
  itemName: 35,
  chilled: 43, // 保冷: 0 none, 1 チルド
  fragile: 44, // 取扱上の注意 こわれもの
  perishable: 45, // 取扱上の注意 なまもの
  sendDate: 50, // 差出予定日
  deliveryDate: 52, // 配達希望日: up to 14 days after 差出予定日
  slot: 53, // 配達希望時間帯
  note: 62, // 摘要/記事
  handover: 64, // 差出方法: 0 集荷 (Japan Post collects), 1 持込 (taken to the post office)
  discount: 65, // 割引 (required): 0 none
} as const;

/**
 * Option columns the manual's sample sets to 0 rather than leaving blank: 39 and 51 発送/差出予定時間帯 (no preference),
 * 40 セキュリティ, 46–48 more handling notes (bottles, this way up, don't stack), 49 予備, 68–72 delivery notices by
 * email. Written the same way, so the tool reads them as the sample's.
 */
const ZERO_COLUMNS = [39, 40, 46, 47, 48, 49, 51, 68, 69, 70, 71, 72];

/** The label's limits, in characters (full-width): names and address lines 25, prefecture and city together 25, 品名 20, phone 13. */
export const JP_LIMIT = { name: 25, line: 25, prefectureCity: 25, item: 20, phone: 13 } as const;

export interface JapanPostSender {
  name: string;
  /** "153-0061" as Settings stores it. */
  postal: string;
  prefecture: string;
  city: string;
  line1: string;
  line2: string;
  phone: string;
}

export interface JapanPostOptions {
  /** 品名, e.g. 焼き菓子. */
  itemName: string;
  chilled: boolean;
  fragile: boolean;
  perishable: boolean;
  /** Japan Post collects the parcels (集荷); otherwise the owner takes them to the post office (持込). */
  collect: boolean;
}

/** One order as the label needs it: the delivery snapshot taken at checkout (and edited since, if it was). */
export interface ShipmentOrder {
  number: string;
  shipToName: string;
  phone: string;
  /** Seven digits. */
  postalCode: string;
  prefecture: string;
  city: string;
  town: string | null;
  line1: string;
  line2: string | null;
  slot: DeliverySlot;
}

export interface JapanPostContext {
  shipAt: Date;
  arriveAt: Date;
  sender: JapanPostSender;
  options: JapanPostOptions;
}

// ---------------------------------------------------------------- text

/** JIS forms of characters CP932 holds under different code points; written as CP932's, they print as typed. */
const CP932_FORMS: Record<string, string> = {
  "〜": "～", // 〜 wave dash → ～
  "−": "－", // − minus → －
  "‖": "∥", // ‖ → ∥
  "—": "―", // — em dash → ―
  "¢": "￠", // ¢
  "£": "￡", // £
  "¬": "￢", // ¬
};

/**
 * Full-width text for the label, as Japan Post's tool expects: half-width kana joined into full-width (ｶﾞｽ → ガス), ASCII
 * letters, digits and symbols made full-width, spaces made ideographic, control characters removed. ' and " become ’
 * and ”, since their own full-width forms are outside plain Shift_JIS. Running it twice changes nothing.
 */
export function toZenkaku(s: string): string {
  return s
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .normalize("NFC")
    .replace(/[｡-ﾟ]+/g, (kana) => kana.normalize("NFKC"))
    .replace(/[!-~]/g, (c) => (c === "'" ? "’" : c === '"' ? "”" : String.fromCharCode(c.charCodeAt(0) + 0xfee0)))
    .replace(/ /g, "　")
    .replace(/[〜−‖—¢£¬]/g, (c) => CP932_FORMS[c]);
}

/** 20261105: a date as Japan sees it. */
export function jstYmd(d: Date): string {
  return new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** A phone number for the label: half-width digits and hyphens, as typed at checkout; null if it isn't a Japanese number. */
export function japanPostPhone(raw: string): string | null {
  const p = normalisePhone(raw);
  return p && p.length <= JP_LIMIT.phone ? p : null;
}

/** Where a CP932 character sits: plain Shift_JIS, or the NEC/IBM extension rows a strict JIS reader may draw wrongly. */
function cp932Risk(bytes: Buffer): "ok" | "extension" {
  if (bytes.length !== 2) return "ok";
  const code = (bytes[0] << 8) | bytes[1];
  return (code >= 0x8740 && code <= 0x879c) || (code >= 0xed40 && code <= 0xeefc) || (code >= 0xfa40 && code <= 0xfc4b) ? "extension" : "ok";
}

/** What CP932 can't carry in this text (written as 〓 in the file), and what it carries only in its extension rows. */
export function cp932Check(text: string): { clean: string; missing: string[]; risky: string[] } {
  const missing: string[] = [];
  const risky: string[] = [];
  let clean = "";
  for (const ch of text) {
    const bytes = iconv.encode(ch, "cp932");
    if (ch !== "?" && bytes.length === 1 && bytes[0] === 0x3f) {
      if (!missing.includes(ch)) missing.push(ch);
      clean += "〓";
      continue;
    }
    if (cp932Risk(bytes) === "extension" && !risky.includes(ch)) risky.push(ch);
    clean += ch;
  }
  return { clean, missing, risky };
}

// ---------------------------------------------------------------- rows

/** A label's text field: made full-width, checked against its limit and against CP932. */
function field(label: string, raw: string, limit: number, problems: string[]): string {
  const z = toZenkaku(raw.trim());
  const { clean, missing, risky } = cp932Check(z);
  if ([...clean].length > limit) problems.push(`${label} is ${[...clean].length} characters; the label takes ${limit}.`);
  if (missing.length) problems.push(`${label} has ${missing.join(" ")}, which the label can't print (it shows as 〓).`);
  if (risky.length) problems.push(`${label} has ${risky.join(" ")}, which may print wrongly on the label.`);
  return clean;
}

/** One order's row: exactly 72 cells, and anything about it the owner should fix in the tool. */
export function japanPostRow(o: ShipmentOrder, ctx: JapanPostContext): { cells: string[]; problems: string[] } {
  const problems: string[] = [];
  const cells: string[] = Array<string>(JP_COLUMNS).fill("");
  const set = (col: number, v: string) => { cells[col - 1] = v; };
  // A trailing 様 would print twice: the label adds its own.
  for (const col of ZERO_COLUMNS) set(col, "0");
  set(JP_COL.kind, "1");
  set(JP_COL.payment, "0");
  set(JP_COL.labels, "1");
  set(JP_COL.toName, field("The recipient's name", o.shipToName.trim().replace(/\s*様$/, ""), JP_LIMIT.name, problems));
  set(JP_COL.toHonorific, "様");
  set(JP_COL.toPostal, o.postalCode);
  set(JP_COL.toPrefecture, o.prefecture);
  const city = field("The city and town", `${o.city}${o.town ?? ""}`, JP_LIMIT.line, problems);
  if ([...o.prefecture].length + [...city].length > JP_LIMIT.prefectureCity) problems.push(`The prefecture, city and town are ${[...o.prefecture].length + [...city].length} characters together; the label takes ${JP_LIMIT.prefectureCity}.`);
  set(JP_COL.toCity, city);
  set(JP_COL.toLine1, field("The street address", o.line1, JP_LIMIT.line, problems));
  set(JP_COL.toLine2, o.line2 ? field("The building and room", o.line2, JP_LIMIT.line, problems) : "");
  const phone = japanPostPhone(o.phone);
  if (!phone) problems.push(`The phone number “${o.phone}” isn't one the label takes, so it's left off.`);
  set(JP_COL.toPhone, phone ?? "");
  const s = ctx.sender;
  set(JP_COL.fromName, toZenkaku(s.name));
  set(JP_COL.fromPostal, s.postal.replace("-", ""));
  set(JP_COL.fromPrefecture, s.prefecture);
  set(JP_COL.fromCity, toZenkaku(s.city));
  set(JP_COL.fromLine1, toZenkaku(s.line1));
  set(JP_COL.fromLine2, toZenkaku(s.line2));
  set(JP_COL.fromPhone, japanPostPhone(s.phone) ?? "");
  set(JP_COL.itemName, toZenkaku(ctx.options.itemName));
  set(JP_COL.chilled, ctx.options.chilled ? "1" : "0");
  set(JP_COL.fragile, ctx.options.fragile ? "1" : "0");
  set(JP_COL.perishable, ctx.options.perishable ? "1" : "0");
  set(JP_COL.sendDate, jstYmd(ctx.shipAt));
  set(JP_COL.deliveryDate, jstYmd(ctx.arriveAt));
  set(JP_COL.slot, japanPostSlotCode(o.slot));
  // The order number on the label, so a parcel and its order can be matched (and the result file matched back).
  set(JP_COL.note, toZenkaku(o.number));
  set(JP_COL.handover, ctx.options.collect ? "0" : "1");
  set(JP_COL.discount, "0");
  return { cells, problems };
}

/** What's missing or wrong in the sender details (Settings → Shipping), each problem naming the setting. */
export function senderProblems(s: JapanPostSender, o: JapanPostOptions): string[] {
  const out: string[] = [];
  const need: [keyof JapanPostSender, string][] = [["name", "Sender name"], ["postal", "Sender postal code"], ["prefecture", "Sender prefecture"], ["city", "Sender city / ward"], ["line1", "Sender address"], ["phone", "Sender phone"]];
  for (const [k, label] of need) if (!s[k].trim()) out.push(`${label} is empty.`);
  if (s.phone.trim() && !japanPostPhone(s.phone)) out.push("Sender phone isn't a Japanese phone number.");
  if (!o.itemName.trim()) out.push("Item description (品名) is empty.");
  else if ([...toZenkaku(o.itemName)].length > JP_LIMIT.item) out.push(`Item description (品名) is ${[...toZenkaku(o.itemName)].length} characters; the label takes ${JP_LIMIT.item}.`);
  if ([...s.prefecture].length + [...toZenkaku(s.city)].length > JP_LIMIT.prefectureCity) out.push(`Sender prefecture and city / ward are more than ${JP_LIMIT.prefectureCity} characters together.`);
  for (const [k, label] of [["name", "Sender name"], ["city", "Sender city / ward"], ["line1", "Sender address"], ["line2", "Sender building / room"]] as const) {
    const { missing } = cp932Check(toZenkaku(s[k]));
    if (missing.length) out.push(`${label} has ${missing.join(" ")}, which the label can't print.`);
  }
  return out;
}

// ---------------------------------------------------------------- the file

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The CSV text: no header row, CRLF after every row, cells quoted only when they must be. */
export function japanPostCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",") + "\r\n").join("");
}

export interface JapanPostExport {
  /** The file, in CP932. */
  bytes: Uint8Array;
  rows: { number: string; problems: string[] }[];
  /** Problems with the file as a whole; while there are any it isn't offered. */
  fileProblems: string[];
}

/** The whole label file for a drop's orders, with each order's problems and the file's. */
export function buildJapanPostExport(orders: ShipmentOrder[], ctx: JapanPostContext): JapanPostExport {
  const fileProblems = senderProblems(ctx.sender, ctx.options).map((p) => `${p} Fill it in under Settings → Shipping.`);
  if (!orders.length) fileProblems.push("There are no orders to ship.");
  if (orders.length > JP_MAX_ROWS) fileProblems.push(`There are ${orders.length} orders; Webゆうパックプリント takes ${JP_MAX_ROWS} per file.`);
  const built = orders.map((o) => ({ number: o.number, ...japanPostRow(o, ctx) }));
  const text = japanPostCsv(built.map((r) => r.cells));
  return { bytes: new Uint8Array(iconv.encode(text, "cp932")), rows: built.map(({ number, problems }) => ({ number, problems })), fileProblems };
}
