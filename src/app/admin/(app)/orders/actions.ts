"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { validateNote, validateOptionalNote } from "@/lib/order-admin-rules";
import {
  addOrderNote, adminCancelOrder, adminCorrectTracking, adminRefund, adminResendEmail, adminShipOrder, adminUpdateDelivery,
  type AdminCancelResult, type AdminRefundResult, type DeliveryResult, type ResendResult, type ShipResult,
} from "@/lib/orders-admin";

/** Add an internal note to an order, signed by the admin who wrote it. */
export async function addOrderNoteAction(number: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const v = validateNote(body);
  if (!v.ok) return v;
  const r = await addOrderNote(number, admin.id, v.body);
  if (!r.ok) return { ok: false, error: "That order no longer exists." };
  revalidatePath(`/admin/orders/${number}`);
  return { ok: true };
}

/**
 * Cancel & refund (PRD 4.4). The note is internal, for the timeline. The boxes may go back on sale and the
 * customer's order page changes, so the whole site is refreshed.
 */
export async function cancelOrderAction(number: string, input: { note?: unknown; notify?: unknown }): Promise<AdminCancelResult> {
  const admin = await requireAdmin();
  const note = validateOptionalNote(input.note);
  if (!note.ok) return note;
  const r = await adminCancelOrder(number, admin.id, { note: note.body, notify: input.notify !== false });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** A refund without cancelling (PRD 4.4). `expectRefunded` is what the page showed as refunded already. */
export async function refundOrderAction(number: string, input: { amount?: unknown; reason?: unknown; note?: unknown }, expectRefunded: unknown): Promise<AdminRefundResult> {
  const admin = await requireAdmin();
  if (!Number.isSafeInteger(expectRefunded)) return { ok: false, error: "Reload the page and try again." };
  const r = await adminRefund(number, admin.id, input, expectRefunded as number);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/**
 * Mark an order shipped with its tracking number (PRD 4.4), or correct a shipped order's number (`correct`). The
 * customer's order page shows the number, so the site is refreshed.
 */
export async function shipOrderAction(number: string, input: { tracking?: unknown; notify?: unknown; correct?: unknown }): Promise<ShipResult> {
  const admin = await requireAdmin();
  const opts = { tracking: input.tracking, notify: input.notify !== false };
  const r = input.correct === true ? await adminCorrectTracking(number, admin.id, opts) : await adminShipOrder(number, admin.id, opts);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Change the recipient, phone, address or time slot (PRD 4.4). `version` is the one the form started from. */
export async function updateDeliveryAction(number: string, input: Record<string, unknown>, version: unknown): Promise<DeliveryResult> {
  const admin = await requireAdmin();
  if (typeof version !== "string") return { ok: false, error: "Reload the page and try again." };
  const r = await adminUpdateDelivery(number, admin.id, input, version);
  if (r.ok && r.changed) revalidatePath("/", "layout");
  return r;
}

/** Send the confirmation or the shipping email again (PRD 4.4). */
export async function resendOrderEmailAction(number: string, kind: unknown): Promise<ResendResult> {
  const admin = await requireAdmin();
  if (kind !== "confirmation" && kind !== "shipped") return { ok: false, error: "Reload the page and try again." };
  const r = await adminResendEmail(number, admin.id, kind);
  if (r.ok) revalidatePath(`/admin/orders/${number}`);
  return r;
}
