import { EMAIL, normaliseEmail } from "./auth-rules";

/**
 * Party and custom order requests (the owner's "want cookies at your next
 * party?" form). Pure rules shared by the form and the server, so both agree on
 * what a valid request is. A request is not an order: the owner checks whether
 * it's doable and confirms by email.
 */

export const PARTY_SIZES = ["upTo20", "20to50", "50to100", "over100"] as const;
export type PartySize = (typeof PARTY_SIZES)[number];
export const OCCASIONS = ["birthday", "office", "wedding", "other"] as const;
export type Occasion = (typeof OCCASIONS)[number];
/** Party-ready: unsealed on parchment in catering boxes. Sealed: each cookie heat-sealed with an ingredient label. */
export const PACKAGINGS = ["unsealed", "sealed"] as const;
export type Packaging = (typeof PACKAGINGS)[number];

export const NAME_MAX = 100;
export const DETAILS_MAX = 2000;
/** The owner needs at least a week to plan and bake; two weeks is what they'd like. */
export const MIN_DAYS_AHEAD = 7;
export const PREFERRED_DAYS_AHEAD = 14;
/** The furthest ahead a party date can be. */
export const MAX_DAYS_AHEAD = 365;
export const RATE_WINDOW_HOURS = 24;
export const RATE_PER_EMAIL = 3;
export const RATE_PER_IP = 10;

/** What the form sends. Values arrive from the browser, so every field is checked here. */
export interface CustomOrderInput {
  name: string;
  email: string;
  /** "2026-11-14" from <input type="date">: a Tokyo calendar day. */
  eventDate: string;
  partySize: string;
  packaging: string;
  occasion?: string | null;
  details: string;
}

export type CustomOrderField = "name" | "email" | "eventDate" | "partySize" | "packaging" | "details";

export interface CustomOrderRequest {
  name: string;
  email: string;
  eventDate: string;
  partySize: PartySize;
  packaging: Packaging;
  occasion: Occasion | null;
  details: string;
}

const DAY = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-20": the Tokyo calendar day `offset` days from `now`. */
export function tokyoDay(now: Date, offset = 0): string {
  return new Date(now.getTime() + 9 * 3_600_000 + offset * DAY).toISOString().slice(0, 10);
}

/** The dates the form offers: a week out (the minimum notice) to a year out. */
export function dateRange(now = new Date()): { min: string; max: string } {
  return { min: tokyoDay(now, MIN_DAYS_AHEAD), max: tokyoDay(now, MAX_DAYS_AHEAD) };
}

/** Whole Tokyo days from today to the party: the notice the owner is getting. */
export function noticeDays(eventDate: string, now = new Date()): number {
  return Math.round((Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${tokyoDay(now)}T00:00:00Z`)) / DAY);
}

/** Allowed, but under the two weeks the owner prefers: the form warns that it may not work out. */
export function isShortNotice(eventDate: string, now = new Date()): boolean {
  return noticeDays(eventDate, now) < PREFERRED_DAYS_AHEAD;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
function isRealDay(s: string): boolean {
  if (!ISO_DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

export function validateCustomOrder(input: CustomOrderInput, now = new Date()): { ok: true; request: CustomOrderRequest } | { ok: false; fields: CustomOrderField[] } {
  // One line for the name (it goes in the email subject); the details keep their line breaks.
  const name = str(input.name).replace(/\s+/g, " ").replace(CONTROL, "").trim();
  const email = normaliseEmail(str(input.email));
  const eventDate = str(input.eventDate).trim();
  const partySize = str(input.partySize);
  const packaging = str(input.packaging);
  const occasion = str(input.occasion);
  const details = str(input.details).replace(/\r\n?/g, "\n").replace(CONTROL, "").trim();
  const { min, max } = dateRange(now);

  const fields: CustomOrderField[] = [];
  if (!name || name.length > NAME_MAX) fields.push("name");
  if (!EMAIL.test(email) || email.length > 254) fields.push("email");
  if (!isRealDay(eventDate) || eventDate < min || eventDate > max) fields.push("eventDate");
  if (!(PARTY_SIZES as readonly string[]).includes(partySize)) fields.push("partySize");
  if (!(PACKAGINGS as readonly string[]).includes(packaging)) fields.push("packaging");
  if (!details || details.length > DETAILS_MAX) fields.push("details");
  if (fields.length) return { ok: false, fields };
  return {
    ok: true,
    request: {
      name,
      email,
      eventDate,
      partySize: partySize as PartySize,
      packaging: packaging as Packaging,
      occasion: (OCCASIONS as readonly string[]).includes(occasion) ? (occasion as Occasion) : null,
      details,
    },
  };
}
