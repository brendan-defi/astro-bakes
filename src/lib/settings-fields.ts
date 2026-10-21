import { normalisePhone } from "./phone";

/**
 * Every setting the owner edits in the admin (PRD 4.9), in the order the form
 * shows them. One list drives the form, the server-side validation and the
 * defaults, so a key can't be editable but unvalidated. Client-safe.
 *
 * Values live in the `settings` table as jsonb under these keys. Payment
 * toggles arrive with Stripe, the LINE QR with photo uploads, the per-item
 * bake buffer with the item editor, and allowed wards when the shop needs
 * fewer than all 23.
 */

export type SettingValue = string | number | boolean;

interface Base {
  key: string;
  label: string;
  help?: string;
  /** Never reaches the public site: read only by the admin and server-side senders. */
  private?: boolean;
}
export type SettingField =
  | (Base & { kind: "text" | "textarea"; default: string; max: number; required?: boolean; placeholder?: string })
  | (Base & { kind: "email" | "url"; default: string; required?: boolean; placeholder?: string })
  | (Base & { kind: "phone" | "postal"; default: string })
  | (Base & { kind: "int"; default: number; min: number; max: number; unit?: string })
  | (Base & { kind: "bool"; default: boolean });

export interface SettingsSection {
  id: string;
  title: string;
  intro?: string;
  fields: SettingField[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "store",
    title: "Store",
    fields: [
      { key: "contact_email", kind: "email", label: "Contact email", default: "hello@astrobakes.xyz", required: true, help: "Shown on the site, the FAQ and the 特商法 page. When customers reply to our emails, the replies go here." },
      { key: "instagram_url", kind: "url", label: "Instagram", default: "", placeholder: "https://www.instagram.com/astrobakes", help: "Linked from the footer and the story section. Empty: the link goes to instagram.com." },
      { key: "line_url", kind: "url", label: "LINE Official Account", default: "", placeholder: "https://lin.ee/…", help: "The add-friend link. Empty: “Add us on LINE” points at the notify-me form instead." },
    ],
  },
  {
    id: "legal",
    title: "特定商取引法に基づく表記",
    intro: "Shown on the 特商法 page (and checked by Stripe and PayPay). Write them as they should appear, in Japanese.",
    fields: [
      { key: "legal_seller_name", kind: "text", label: "販売業者 (seller)", default: "", max: 100, help: "Must match the Stripe account's legal name exactly. Empty shows 「請求があったら遅滞なく開示します」." },
      { key: "legal_operator", kind: "text", label: "運営責任者 (person responsible)", default: "", max: 100, help: "Empty leaves the row out." },
      { key: "legal_address", kind: "textarea", label: "所在地 (address)", default: "", max: 200, help: "A sole proprietor may leave this empty: the page then says it's disclosed on request." },
      { key: "legal_phone", kind: "phone", label: "電話番号 (phone)", default: "", help: "Empty: disclosed on request, as above." },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    fields: [
      { key: "owner_email", kind: "email", label: "Owner email", default: "", private: true, help: "Where new-order emails and party requests go. Empty uses the contact email." },
      { key: "notify_new_order", kind: "bool", label: "Email me on each new order", default: true, private: true },
    ],
  },
  {
    id: "shipping",
    title: "Shipping and labels",
    intro: "The sender details are printed on Japan Post labels and never shown on the site.",
    fields: [
      { key: "shipping_fee", kind: "int", label: "Shipping fee (税込)", default: 0, min: 0, max: 5000, unit: "¥", help: "0 means shipping is included in the box price and no fee line is shown (D19). Anything else is added to every order. Change it between drops: it's locked while a drop is open or anyone is checking out." },
      { key: "arrival_offset_days", kind: "int", label: "Expected arrival", default: 1, min: 1, max: 7, unit: "days after the ship date", help: "Japan Post delivers next day within Tokyo. Shown on the drop page, at checkout, in emails and on order pages." },
      { key: "jp_sender_name", kind: "text", label: "Sender name", default: "", max: 25, private: true },
      { key: "jp_sender_postal", kind: "postal", label: "Sender postal code", default: "", private: true },
      { key: "jp_sender_prefecture", kind: "text", label: "Sender prefecture", default: "東京都", max: 10, private: true },
      { key: "jp_sender_city", kind: "text", label: "Sender city / ward", default: "", max: 25, private: true, placeholder: "例: 目黒区" },
      { key: "jp_sender_line1", kind: "text", label: "Sender address", default: "", max: 25, private: true, placeholder: "例: 上目黒1-2-3" },
      { key: "jp_sender_line2", kind: "text", label: "Sender building / room", default: "", max: 25, private: true },
      { key: "jp_sender_phone", kind: "phone", label: "Sender phone", default: "", private: true },
      { key: "jp_item_name", kind: "text", label: "Item description (品名)", default: "焼き菓子", max: 25, required: true, private: true },
      { key: "jp_chilled", kind: "bool", label: "Send chilled (クール)", default: false, private: true, help: "Off sends at room temperature (常温)." },
      { key: "jp_fragile", kind: "bool", label: "Mark as fragile (こわれもの)", default: true, private: true },
    ],
  },
];

export const SETTING_FIELDS: SettingField[] = SETTINGS_SECTIONS.flatMap((s) => s.fields);
export const settingField = (key: string) => SETTING_FIELDS.find((f) => f.key === key);

/** The defaults, keyed: what a page sees when the owner hasn't set a value. */
export const SETTING_DEFAULTS: Record<string, SettingValue> = Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, f.default]));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL = /^\d{3}-?\d{4}$/;

/**
 * A link as it should be stored and used as an href: the URL parser's own canonical form of an https address with a
 * real host and no credentials, or null. Saving and reading both go through this, so "HTTPS://…" or "https:lin.ee/…"
 * is stored as "https://…" and reads back as it was saved, rather than one check accepting what the other drops.
 */
export function httpsLink(text: string): string | null {
  try {
    const u = new URL(text.trim());
    if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * A stored value of the right type for its field, or the field's default. A link reads through httpsLink, so anything
 * that isn't a usable https address (the seed's "#notify" placeholder) reads as unset, which the site treats as "use
 * the fallback".
 */
export function settingValue(field: SettingField, stored: unknown): SettingValue {
  if (field.kind === "bool") return typeof stored === "boolean" ? stored : field.default;
  if (field.kind === "int") return typeof stored === "number" && Number.isInteger(stored) ? stored : field.default;
  if (field.kind === "url") return (typeof stored === "string" && httpsLink(stored)) || field.default;
  return typeof stored === "string" ? stored : field.default;
}

export type SettingsValidation = { ok: true; values: Record<string, SettingValue> } | { ok: false; errors: Record<string, string> };

/**
 * Check a submitted form: every field present, of the right type, within its
 * limits. Text is trimmed and normalised (half-width digits, the customer's
 * own phone hyphens, 123-4567 postal codes). Unknown keys are ignored.
 */
export function validateSettings(input: Record<string, unknown>): SettingsValidation {
  const values: Record<string, SettingValue> = {};
  const errors: Record<string, string> = {};
  for (const f of SETTING_FIELDS) {
    const raw = input[f.key];
    if (f.kind === "bool") {
      if (typeof raw !== "boolean") errors[f.key] = "Choose on or off.";
      else values[f.key] = raw;
      continue;
    }
    if (f.kind === "int") {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw.normalize("NFKC").trim()) : NaN;
      if (!Number.isInteger(n) || n < f.min || n > f.max) errors[f.key] = `A whole number from ${f.min} to ${f.max}.`;
      else values[f.key] = n;
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : "";
    if (typeof raw !== "string") errors[f.key] = "Missing.";
    else if (!text) {
      if ("required" in f && f.required) errors[f.key] = "Required.";
      else values[f.key] = "";
    } else if (f.kind === "email") {
      if (!EMAIL.test(text)) errors[f.key] = "That doesn't look like an email address.";
      else values[f.key] = text.toLowerCase();
    } else if (f.kind === "url") {
      const link = httpsLink(text);
      if (!link) errors[f.key] = "A full https:// link, like https://lin.ee/abc123.";
      else values[f.key] = link;
    } else if (f.kind === "phone") {
      const phone = normalisePhone(text);
      if (!phone) errors[f.key] = "A Japanese phone number, like 03-1234-5678.";
      else values[f.key] = phone;
    } else if (f.kind === "postal") {
      const p = text.normalize("NFKC").replace(/[ー‐‑‒–—―−ｰ]/g, "-");
      if (!POSTAL.test(p)) errors[f.key] = "Seven digits, like 153-0061.";
      else values[f.key] = `${p.replace("-", "").slice(0, 3)}-${p.replace("-", "").slice(3)}`;
    } else if (f.kind === "text" || f.kind === "textarea") {
      if (text.length > f.max) errors[f.key] = `At most ${f.max} characters (this is ${text.length}).`;
      else values[f.key] = text;
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}
