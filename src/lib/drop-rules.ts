import type { DropState } from "./data";

/**
 * Rules for the drop editor (PRD 4.2). Client-safe: the form uses the same
 * limits the server enforces.
 *
 * Times are entered and shown in Japan time, whatever the admin's browser
 * says: open, close and bake as date-times, the ship date as a day (stored as
 * midnight JST, like the seeded drops).
 */

const JST_OFFSET_MS = 9 * 3_600_000;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** A Date as a datetime-local value in Japan time: "2026-11-08T10:00". */
export function toJstLocal(d: Date): string {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}T${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}`;
}

/** A datetime-local value read as Japan time; null unless it's a real date and time. */
export function fromJstLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET_MS;
  return toJstLocal(new Date(utc)) === s.trim() ? new Date(utc) : null;
}

/** A Date as a date value in Japan time: "2026-11-22". */
export const toJstDay = (d: Date) => toJstLocal(d).slice(0, 10);

/** A date value read as midnight Japan time; null unless it's a real date. */
export const fromJstDay = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? fromJstLocal(`${s.trim()}T00:00`) : null);

/** The same Japan wall-clock time a month later (the 31st becomes the month's last day): how Duplicate moves dates. */
export function nextMonth(d: Date): Date {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  const y = j.getUTCFullYear(), m = j.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(j.getUTCDate(), last), j.getUTCHours(), j.getUTCMinutes()) - JST_OFFSET_MS);
}

/** "drop-05": set with the number when a drop is created; carts and checkout refer to drops by it. */
export const dropSlug = (n: number) => `drop-${pad(n)}`;

/**
 * What the editor may change, by the drop's effective state. Before it opens, everything. Once it's open (or past),
 * customers have been shown its dates, boxes and prices and may have paid them: names and caps stay editable (a cap
 * never below what's sold or held), the rest is fixed. Dates move through the lifecycle actions (Close now, Reopen),
 * which keep the state machine consistent.
 */
export function editable(state: DropState) {
  const before = state === "draft" || state === "scheduled";
  const selling = state === "open" || state === "closed" || state === "baking";
  return { dates: before, boxes: before, prices: before, caps: before || selling };
}

export type Errors = Record<string, string>;
type Raw = Record<string, unknown>;

export interface DropBoxValue {
  boxSlug: string;
  cap: number;
  price: number;
  maxPerCustomer: number;
}

export interface DropValue {
  /** Only when creating. */
  number: number;
  nameEn: string;
  nameJa: string;
  descriptionEn: string;
  descriptionJa: string;
  openAt: Date;
  closeAt: Date;
  bakeAt: Date | null;
  shipAt: Date;
  /** In menu order. */
  boxes: DropBoxValue[];
}

/** What the server knows about the drop being edited, for the checks only it can make. */
export interface DropContext {
  creating: boolean;
  state: DropState;
  now: Date;
  /** Per box already in the drop: sold and currently held in checkouts. */
  taken: Record<string, { sold: number; held: number }>;
}

export const MAX_DROP_BOXES = 20;
export const MIN_PRICE = 50;

function text(errors: Errors, raw: Raw, key: string, max: number, required = false): string {
  const v = typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
  if (!v && required) errors[key] = "Required.";
  else if (v.length > max) errors[key] = `At most ${max} characters (this is ${v.length}).`;
  return v;
}

function int(errors: Errors, raw: Raw, key: string, errKey: string, min: number, max: number): number {
  const r = raw[key];
  const n = typeof r === "number" ? r : typeof r === "string" && r.trim() !== "" ? Number(r.normalize("NFKC").trim().replace(/,/g, "")) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) errors[errKey] = `A whole number from ${min} to ${max.toLocaleString("en-US")}.`;
  return n;
}

/**
 * Check a submitted drop form. Fields the drop's state doesn't let the editor change are still read (the server keeps
 * the stored values for them; see drops-admin.ts), but only the editable ones are checked against the clock.
 */
export function validateDrop(raw: Raw, ctx: DropContext): { ok: true; value: DropValue } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  const can = editable(ctx.state);
  const date = (key: string, parse: (s: string) => Date | null, required: boolean): Date | null => {
    const s = typeof raw[key] === "string" ? (raw[key] as string) : "";
    if (!s.trim()) {
      if (required) errors[key] = "Required.";
      return null;
    }
    const d = parse(s);
    if (!d) errors[key] = "Not a valid date.";
    return d;
  };
  const openAt = date("openAt", fromJstLocal, true);
  const closeAt = date("closeAt", fromJstLocal, true);
  const bakeAt = date("bakeAt", fromJstLocal, false);
  const shipAt = date("shipAt", fromJstDay, true);
  if (can.dates && openAt && closeAt && shipAt) {
    if (closeAt <= openAt) errors.closeAt = "Must be after it opens.";
    else if (shipAt <= closeAt) errors.shipAt = "Must be after it closes.";
    if (bakeAt && closeAt && shipAt && (bakeAt < closeAt || bakeAt.getTime() >= shipAt.getTime() + 86_400_000)) errors.bakeAt = "Between the close and the end of the ship date.";
    if (ctx.state === "scheduled" && openAt <= ctx.now) errors.openAt = "A scheduled drop has to open in the future. To open it now, use Open now.";
  }

  const boxesIn = Array.isArray(raw.boxes) ? (raw.boxes as unknown[]) : null;
  const boxes: DropBoxValue[] = [];
  if (!boxesIn || boxesIn.length === 0) errors.boxes = "Add at least one box.";
  else if (boxesIn.length > MAX_DROP_BOXES) errors.boxes = `At most ${MAX_DROP_BOXES} boxes.`;
  else {
    const seen = new Set<string>();
    boxesIn.forEach((row, i) => {
      const r = (row ?? {}) as Raw;
      const boxSlug = typeof r.boxSlug === "string" ? r.boxSlug.trim() : "";
      if (!boxSlug) errors[`boxes.${i}.box`] = "Choose a box.";
      else if (seen.has(boxSlug)) errors[`boxes.${i}.box`] = "This box is already in the drop.";
      seen.add(boxSlug);
      const cap = int(errors, r, "cap", `boxes.${i}.cap`, 0, 1000);
      const price = int(errors, r, "price", `boxes.${i}.price`, MIN_PRICE, 100_000);
      const maxPerCustomer = int(errors, r, "maxPerCustomer", `boxes.${i}.maxPerCustomer`, 1, 20);
      const taken = Object.hasOwn(ctx.taken, boxSlug) ? ctx.taken[boxSlug] : null;
      if (taken && Number.isInteger(cap) && cap < taken.sold + taken.held && !errors[`boxes.${i}.cap`]) {
        errors[`boxes.${i}.cap`] = `At least ${taken.sold + taken.held}: ${taken.sold} sold${taken.held ? `, ${taken.held} in checkouts right now` : ""}.`;
      }
      boxes.push({ boxSlug, cap, price, maxPerCustomer });
    });
  }

  const value: DropValue = {
    number: ctx.creating ? int(errors, raw, "number", "number", 1, 999) : 0,
    nameEn: text(errors, raw, "nameEn", 80, true),
    nameJa: text(errors, raw, "nameJa", 80, true),
    descriptionEn: text(errors, raw, "descriptionEn", 300),
    descriptionJa: text(errors, raw, "descriptionJa", 300),
    openAt: openAt ?? new Date(NaN),
    closeAt: closeAt ?? new Date(NaN),
    bakeAt,
    shipAt: shipAt ?? new Date(NaN),
    boxes,
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
