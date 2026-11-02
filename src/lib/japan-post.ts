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
 * Nothing is ever truncated or dropped quietly. What the tool would refuse (a field over its limit, a shared setting
 * it can't print) stops the file until it's fixed on the order or in Settings; what it would take but may print wrongly
 * (a character written as 〓, one from CP932's extension rows) is listed with the order, to check in the tool.
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

/** The label's limits, in characters (full-width): names and address lines 25, prefecture 5, prefecture and city together 25, 品名 20, phone 13. */
export const JP_LIMIT = { name: 25, line: 25, prefecture: 5, prefectureCity: 25, item: 20, phone: 13 } as const;

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

// ---------------------------------------------------------------- checks

/**
 * What a label's text needs, sorted by what it means for the upload. An error stops the file: Webゆうパックプリント
 * refuses a field over its column's limit (its manual: 桁数より多い文字を入力するとエラー; fix the data and upload
 * again), so it's fixed here first. A warning doesn't: the row imports, and the owner can correct it in the tool before
 * printing.
 */
export interface Checked {
  errors: string[];
  warnings: string[];
}
const checked = (): Checked => ({ errors: [], warnings: [] });

/**
 * One field's text, the way the label takes it: made full-width, then checked against its limit and against CP932.
 * A character CP932 can't carry is written as 〓. On a recipient's field that's a warning (the row imports, and the
 * tool can take the real character); on a shared setting it's an error (`shared`), since it would be on every label.
 * One that may print wrongly is always a warning.
 */
function text(label: string, raw: string, limit: number, out: Checked, shared = false): string {
  const { clean, missing, risky } = cp932Check(toZenkaku(raw.trim()));
  const n = [...clean].length;
  if (n > limit) out.errors.push(`${label} is ${n} characters; the label takes ${limit}.`);
  if (missing.length) (shared ? out.errors : out.warnings).push(`${label} has ${missing.join(" ")}, which the label can't print${shared ? "" : " (it shows as 〓)"}.`);
  if (risky.length) out.warnings.push(`${label} has ${risky.join(" ")}, which may print wrongly on the label.`);
  return clean;
}

const length = (s: string) => [...s].length;

/**
 * The recipient's address across 都道府県 (12), 市区町村郡 (13) and 丁目番地号 (14). The prefecture and the 13th column must
 * fit in 25 together; when the city and town don't, the town moves to the front of the 14th column instead, losing
 * nothing. Only an address that fits neither way is an error.
 */
function address(o: ShipmentOrder, out: Checked): { city: string; line1: string } {
  const city = toZenkaku(o.city.trim());
  const town = toZenkaku((o.town ?? "").trim());
  const street = toZenkaku(o.line1.trim());
  const roomFor13 = JP_LIMIT.prefectureCity - length(o.prefecture);
  const [col13, col14] = length(city + town) > roomFor13 && town && length(town + street) <= JP_LIMIT.line ? [city, town + street] : [city + town, street];
  const cityOut = text("The city and town", col13, JP_LIMIT.line, out);
  if (length(cityOut) <= JP_LIMIT.line && length(o.prefecture) + length(cityOut) > JP_LIMIT.prefectureCity) {
    out.errors.push(`The prefecture, city and town are ${length(o.prefecture) + length(cityOut)} characters together; the label takes ${JP_LIMIT.prefectureCity}.`);
  }
  return { city: cityOut, line1: text("The street address", col14, JP_LIMIT.line, out) };
}

/** The sender and parcel text every row shares (Settings → Shipping), as the label takes it, with what to fix there. */
export interface SharedFields extends Checked {
  name: string;
  postal: string;
  prefecture: string;
  city: string;
  line1: string;
  line2: string;
  phone: string;
  itemName: string;
}

/**
 * The sender and 品名, through the same checks as a recipient's text, except that a character the label can't print is
 * an error: it would be on every label. Each problem names its setting.
 */
export function sharedFields(s: JapanPostSender, o: JapanPostOptions): SharedFields {
  const out = checked();
  const need: [keyof JapanPostSender, string][] = [["name", "Sender name"], ["postal", "Sender postal code"], ["prefecture", "Sender prefecture"], ["city", "Sender city / ward"], ["line1", "Sender address"], ["phone", "Sender phone"]];
  for (const [k, label] of need) if (!s[k].trim()) out.errors.push(`${label} is empty.`);
  if (!o.itemName.trim()) out.errors.push("Item description (品名) is empty.");
  const phone = s.phone.trim() ? japanPostPhone(s.phone) : "";
  if (phone === null) out.errors.push("Sender phone isn't a Japanese phone number.");
  const name = text("Sender name", s.name, JP_LIMIT.name, out, true);
  const prefecture = text("Sender prefecture", s.prefecture, JP_LIMIT.prefecture, out, true);
  const city = text("Sender city / ward", s.city, JP_LIMIT.line, out, true);
  if (length(prefecture) + length(city) > JP_LIMIT.prefectureCity) out.errors.push(`Sender prefecture and city / ward are ${length(prefecture) + length(city)} characters together; the label takes ${JP_LIMIT.prefectureCity}.`);
  const line1 = text("Sender address", s.line1, JP_LIMIT.line, out, true);
  const line2 = s.line2.trim() ? text("Sender building / room", s.line2, JP_LIMIT.line, out, true) : "";
  const itemName = o.itemName.trim() ? text("Item description (品名)", o.itemName, JP_LIMIT.item, out, true) : "";
  return { ...out, name, postal: s.postal.replace("-", ""), prefecture, city, line1, line2, phone: phone ?? "", itemName };
}

// ---------------------------------------------------------------- rows

/**
 * One order's row: exactly 72 cells, with what stops it uploading (errors, to fix on the order first) and what to
 * check in the tool before printing (warnings). The sender's own problems are the file's (sharedFields).
 */
export function japanPostRow(o: ShipmentOrder, ctx: JapanPostContext, shared = sharedFields(ctx.sender, ctx.options)): { cells: string[] } & Checked {
  const out = checked();
  const cells: string[] = Array<string>(JP_COLUMNS).fill("");
  const set = (col: number, v: string) => { cells[col - 1] = v; };
  for (const col of ZERO_COLUMNS) set(col, "0");
  set(JP_COL.kind, "1");
  set(JP_COL.payment, "0");
  set(JP_COL.labels, "1");
  // A trailing 様 would print twice: the label adds its own.
  set(JP_COL.toName, text("The recipient's name", o.shipToName.trim().replace(/\s*様$/, ""), JP_LIMIT.name, out));
  set(JP_COL.toHonorific, "様");
  set(JP_COL.toPostal, o.postalCode);
  set(JP_COL.toPrefecture, o.prefecture);
  const addr = address(o, out);
  set(JP_COL.toCity, addr.city);
  set(JP_COL.toLine1, addr.line1);
  set(JP_COL.toLine2, o.line2?.trim() ? text("The building and room", o.line2, JP_LIMIT.line, out) : "");
  const phone = japanPostPhone(o.phone);
  if (!phone) out.warnings.push(`The phone number “${o.phone}” isn't one the label takes, so it's left off.`);
  set(JP_COL.toPhone, phone ?? "");
  set(JP_COL.fromName, shared.name);
  set(JP_COL.fromPostal, shared.postal);
  set(JP_COL.fromPrefecture, shared.prefecture);
  set(JP_COL.fromCity, shared.city);
  set(JP_COL.fromLine1, shared.line1);
  set(JP_COL.fromLine2, shared.line2);
  set(JP_COL.fromPhone, shared.phone);
  set(JP_COL.itemName, shared.itemName);
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
  return { cells, ...out };
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
  /** Each order's errors (fix on the order before the file is offered) and warnings (check in the tool). */
  rows: ({ number: string } & Checked)[];
  /** What stops the file being offered: the sender's errors, orders with errors, none or too many orders. */
  fileProblems: string[];
  /** The sender's warnings, for every label. */
  fileWarnings: string[];
}

/**
 * The whole label file for a drop's orders. It's offered only when every row can upload: a row with an error would be
 * refused by the tool, and fixing it there isn't possible, so it's fixed on the order (or in Settings) first.
 */
export function buildJapanPostExport(orders: ShipmentOrder[], ctx: JapanPostContext): JapanPostExport {
  const shared = sharedFields(ctx.sender, ctx.options);
  const built = orders.map((o) => ({ number: o.number, ...japanPostRow(o, ctx, shared) }));
  const fileProblems = shared.errors.map((p) => `${p} Fix it under Settings → Shipping.`);
  const blocked = built.filter((r) => r.errors.length).length;
  if (blocked) fileProblems.push(`${blocked === 1 ? "One order has" : `${blocked} orders have`} details the label can't take (listed below). Fix them on the order with Edit delivery details, then download.`);
  if (!orders.length) fileProblems.push("There are no orders to ship.");
  if (orders.length > JP_MAX_ROWS) fileProblems.push(`There are ${orders.length} orders; Webゆうパックプリント takes ${JP_MAX_ROWS} per file.`);
  const csv = japanPostCsv(built.map((r) => r.cells));
  return {
    bytes: new Uint8Array(iconv.encode(csv, "cp932")),
    rows: built.map(({ number, errors, warnings }) => ({ number, errors, warnings })),
    fileProblems,
    fileWarnings: shared.warnings.map((p) => `${p} (Settings → Shipping)`),
  };
}
