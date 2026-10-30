"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { setPacked, type PackResult } from "@/lib/fulfilment";

/** Tick an order off on the pack list, or untick it (PRD 4.6). */
export async function setPackedAction(number: string, packed: unknown): Promise<PackResult> {
  await requireAdmin();
  if (typeof packed !== "boolean") return { ok: false, error: "Reload the page and try again." };
  const r = await setPacked(number, packed);
  if (r.ok) revalidatePath(`/admin/orders/${number}`);
  return r;
}
