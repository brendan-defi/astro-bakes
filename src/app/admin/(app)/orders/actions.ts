"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { validateNote } from "@/lib/order-admin-rules";
import { addOrderNote } from "@/lib/orders-admin";

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
