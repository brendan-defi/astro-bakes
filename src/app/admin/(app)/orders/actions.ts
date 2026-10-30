"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { validateNote, validateOptionalNote } from "@/lib/order-admin-rules";
import { addOrderNote, adminCancelOrder, adminRefund, type AdminCancelResult, type AdminRefundResult } from "@/lib/orders-admin";

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
