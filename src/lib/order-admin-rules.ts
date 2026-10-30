import type { OrderState } from "./order-status";

/**
 * Rules for the admin's order pages (PRD 4.4). Client-safe: labels, filters,
 * the timeline and CSV formatting, with no database access.
 */

/** How the admin sees an order's state: like the stored one, except an unpaid order whose hold has lapsed reads as expired. */
export type DisplayState = OrderState;

export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  packed: "Packed",
  shipped: "Shipped",
  complete: "Delivered",
  expired: "Expired",
  cancelled: "Cancelled",
};

/**
 * An order waiting for payment only stays that way while its checkout still holds the boxes (D8). Once the hold has
 * lapsed the order can't be paid, and the sweep that marks it expired runs at most daily, so show it as expired now.
 */
export function displayState(state: OrderState, liveHold: boolean): DisplayState {
  return state === "pending_payment" && !liveHold ? "expired" : state;
}

// ---------------------------------------------------------------- filters

export const FILTER_STATES = ["paid", "packed", "shipped", "complete", "pending_payment", "expired", "cancelled"] as const;
export type FilterState = (typeof FILTER_STATES)[number];

export interface OrderFilters {
  /** A drop's slug, or undefined for every drop. */
  drop?: string;
  state?: FilterState;
  /** Matches the order number, the customer's name or email, the recipient's name, or the phone number. */
  q?: string;
  page: number;
}

export const PAGE_SIZE = 50;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** Filters from the page's query string; anything malformed is dropped rather than refused. */
export function parseOrderFilters(sp: Record<string, string | string[] | undefined>): OrderFilters {
  const drop = one(sp.drop);
  const state = one(sp.state);
  const q = one(sp.q)?.slice(0, 100);
  const page = Number(one(sp.page));
  return {
    drop: drop && /^[a-z0-9-]{1,60}$/.test(drop) ? drop : undefined,
    state: (FILTER_STATES as readonly string[]).includes(state ?? "") ? (state as FilterState) : undefined,
    q,
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** The query string for these filters (page 1 unless given), for links that keep the current view. */
export function filterQuery(f: Partial<OrderFilters>, extra: Partial<OrderFilters> = {}): string {
  const all = { ...f, ...extra };
  const p = new URLSearchParams();
  if (all.drop) p.set("drop", all.drop);
  if (all.state) p.set("state", all.state);
  if (all.q) p.set("q", all.q);
  if (all.page && all.page > 1) p.set("page", String(all.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** A LIKE pattern matching `q` anywhere, with LIKE's own wildcards taken literally. */
export const likeAnywhere = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ---------------------------------------------------------------- notes

export const NOTE_MAX = 2000;

export function validateNote(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) return { ok: false, error: "Write something first." };
  if (body.length > NOTE_MAX) return { ok: false, error: `At most ${NOTE_MAX.toLocaleString("en-US")} characters (this is ${body.length.toLocaleString("en-US")}).` };
  return { ok: true, body };
}

// ---------------------------------------------------------------- timeline

export interface TimelineEntry {
  at: Date;
  /** What kind of thing happened, for styling: the order's own steps, emails, money, or a person's note. */
  kind: "step" | "email" | "money" | "note";
  title: string;
  detail?: string;
  /** Who, for notes and admin actions. */
  by?: string;
}

export interface TimelineSource {
  createdAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  packedAt: Date | null;
  shippedAt: Date | null;
  trackingNumber: string | null;
  state: OrderState;
  /** A note the system left on the order itself (the mock payment writes one). */
  systemNote: string | null;
  refunds: { amount: number; reason: string; createdAt: Date; issuedAt: Date | null }[];
  emails: { type: string; to: string; sentAt: Date; error: string | null }[];
  events: { kind: string; body: string; createdAt: Date; by: string | null }[];
}

const EMAIL_LABEL: Record<string, string> = {
  order_confirmation: "Order confirmation emailed",
  order_cancelled: "Cancellation emailed",
  shipped: "Shipping email sent",
  internal: "New-order email to the owner",
};
const REFUND_REASON: Record<string, string> = {
  customer_cancelled: "customer cancelled",
  admin_cancelled: "cancelled by the shop",
  damage: "damage",
  non_delivery: "non-delivery",
};
const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

/** Everything that happened to an order, oldest first, from its timestamps, refunds, emails and admin events. */
export function buildTimeline(o: TimelineSource): TimelineEntry[] {
  const out: TimelineEntry[] = [{ at: o.createdAt, kind: "step", title: "Order placed", detail: o.systemNote ?? undefined }];
  if (o.paidAt) out.push({ at: o.paidAt, kind: "step", title: "Paid" });
  if (o.packedAt) out.push({ at: o.packedAt, kind: "step", title: "Packed" });
  if (o.shippedAt) out.push({ at: o.shippedAt, kind: "step", title: "Shipped", detail: o.trackingNumber ? `Tracking ${o.trackingNumber}` : undefined });
  if (o.cancelledAt) out.push({ at: o.cancelledAt, kind: "step", title: "Cancelled" });
  for (const r of o.refunds) {
    out.push({ at: r.createdAt, kind: "money", title: `Refund of ${yen(r.amount)} recorded`, detail: `${REFUND_REASON[r.reason] ?? r.reason}; ${r.issuedAt ? "issued" : "owed until payments are connected"}` });
    if (r.issuedAt) out.push({ at: r.issuedAt, kind: "money", title: `Refund of ${yen(r.amount)} issued` });
  }
  for (const e of o.emails) {
    out.push({ at: e.sentAt, kind: "email", title: EMAIL_LABEL[e.type] ?? `Email: ${e.type}`, detail: e.error ? `Failed to ${e.to}: ${e.error}` : `To ${e.to}` });
  }
  for (const e of o.events) {
    out.push({ at: e.createdAt, kind: e.kind === "note" ? "note" : "step", title: e.kind === "note" ? "Note" : e.body, detail: e.kind === "note" ? e.body : undefined, by: e.by ?? undefined });
  }
  // Stable: things recorded at the same moment keep the order above (placed before its email).
  return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.at.getTime() - b.e.at.getTime() || a.i - b.i).map(({ e }) => e);
}

// ---------------------------------------------------------------- CSV

/** An identifier that must stay text, like a phone or tracking number, however much it looks like a number. */
export interface TextCell {
  text: string;
}
export const textCell = (text: string | null | undefined): TextCell => ({ text: text ?? "" });

export type CsvValue = string | number | TextCell | null | undefined;

/**
 * One CSV cell. Quoted when it holds a comma, quote or line break; and a cell a spreadsheet would read as a formula
 * (starting =, +, -, @, tab or carriage return) gets a leading apostrophe, so a customer's name can't run in Excel.
 *
 * Excel and Numbers turn a cell of digits into a number, so 09012345678 opens as 9012345678 (checked in both). A text
 * cell made only of digits is written as ="09012345678", the one form both keep as text. Only digits go inside it, so
 * nothing else can run; other CSV readers see the formula as written.
 */
export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (/^\d+$/.test(v.text)) return `"=""${v.text}"""`;
    v = v.text;
  }
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A whole CSV file: a UTF-8 byte-order mark (so Excel in Japan reads the kana and kanji right), CRLF line ends. */
export function toCsv(rows: CsvValue[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
