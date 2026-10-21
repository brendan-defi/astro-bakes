import { normalisePhone } from "./phone";
import { lookupPostal, normalisePostal, outsideWards } from "./postal";

/**
 * The pure rules behind the checkout write path (PRD 3.3, 3.4, D7, D20).
 * Kept free of server-only imports so they can be unit tested; checkout.ts
 * applies them inside database transactions.
 */

export type ReCheckChange =
  | { kind: "gone"; box: string; from: number }
  | { kind: "cut"; box: string; from: number; to: number; left: number };

export interface Available {
  left: number;
  maxPerCustomer: number;
}

/** Clamp a requested cart to what can be bought, describing every change for the customer (PRD 3.3). */
export function reconcile(requested: Record<string, number>, avail: Map<string, Available>) {
  const items: Record<string, number> = {};
  const changes: ReCheckChange[] = [];
  for (const [slug, raw] of Object.entries(requested)) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) continue;
    const a = avail.get(slug);
    const cap = a ? Math.min(a.left, a.maxPerCustomer) : 0;
    if (cap <= 0) changes.push({ kind: "gone", box: slug, from: n });
    else if (n > cap) {
      changes.push({ kind: "cut", box: slug, from: n, to: cap, left: a!.left });
      items[slug] = cap;
    } else items[slug] = n;
  }
  return { items, changes };
}

/** AB-003-017: drop 3, 17th order (PRD 5.1). */
export function orderNumber(dropNumber: number, sequence: number): string {
  const pad = (n: number) => String(n).padStart(3, "0");
  return `AB-${pad(dropNumber)}-${pad(sequence)}`;
}

export interface DeliveryInput {
  name: string;
  phone: string;
  postal: string;
  line1: string;
  line2: string;
}

/**
 * Server-side copy of the delivery rules: required fields, a Japanese phone number, and a 7-digit code that
 * resolves inside the 23 wards (D20). `phone` and `postal` come back normalised, ready to store.
 */
export function validateDelivery(d: DeliveryInput) {
  const postal = normalisePostal(d?.postal ?? "");
  const hit = postal.length === 7 ? lookupPostal(postal) : null;
  const phone = typeof d?.phone === "string" ? normalisePhone(d.phone) : null;
  const errors: string[] = [];
  if (!d?.name?.trim()) errors.push("name");
  if (!phone) errors.push("phone");
  if (!d?.line1?.trim()) errors.push("line1");
  if (!hit) errors.push(outsideWards(postal) ? "area" : "postal");
  else if (!hit.deliverable) errors.push("area");
  return { ok: errors.length === 0, errors, phone: phone ?? "", postal, hit };
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
