"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import type { DropState } from "@/lib/data";
import { cancelDrop, dropContext, duplicateDrop, saveDrop, transitionDrop, type CancelDropResult } from "@/lib/drops-admin";
import { fromJstLocal, isDropState, validateDrop, type Errors } from "@/lib/drop-rules";
import { isDropAction } from "@/lib/drop-transitions";

export type SaveDropResult = { ok: true; slug: string } | { ok: false; errors: Errors };

/**
 * Create a draft (`slug` null) or save the drop with that slug. `drawnFor` is the state the form was drawn for; a
 * drop that has since moved to a state locking different fields is refused with errors.state (see drops-admin.ts).
 * A scheduled or live drop shows on the shop, so the whole site is refreshed.
 */
export async function saveDropAction(input: Record<string, unknown>, slug: string | null, drawnFor?: unknown): Promise<SaveDropResult> {
  await requireAdmin();
  const ctx = await dropContext(slug);
  if (!ctx) return { ok: false, errors: { form: "That drop no longer exists." } };
  const r = validateDrop(input, ctx);
  if (!r.ok) return r;
  const saved = await saveDrop(r.value, slug, isDropState(drawnFor) ? drawnFor : undefined);
  if (saved.ok) revalidatePath("/", "layout");
  return saved;
}

export type TransitionResult = { ok: true; state: DropState } | { ok: false; error: string };

/**
 * A lifecycle action on a drop (PRD 5.2a): schedule, open now, close now, reopen, baking, shipped, complete.
 * Reopen takes the new closing time as a datetime-local value in Japan time. The shop shows the result at once,
 * so the whole site is refreshed.
 */
export async function transitionDropAction(slug: string, action: unknown, input: { closeAt?: unknown } = {}): Promise<TransitionResult> {
  await requireAdmin();
  if (!isDropAction(action)) return { ok: false, error: "That isn't a lifecycle action." };
  const closeAt = typeof input.closeAt === "string" && input.closeAt.trim() ? fromJstLocal(input.closeAt) : null;
  if (action === "reopen" && !closeAt) return { ok: false, error: "Pick a new closing time." };
  const r = await transitionDrop(slug, action, { closeAt });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/**
 * Cancel drop (PRD 4.2): cancels and refunds every order on it and emails each customer, which can take a while
 * with many orders (the emails are spaced out). `expectOrders` is the order count the confirmation showed.
 */
export async function cancelDropAction(slug: string, expectOrders: unknown): Promise<CancelDropResult> {
  const admin = await requireAdmin();
  if (!Number.isSafeInteger(expectOrders)) return { ok: false, error: "Reload the page and try again." };
  const r = await cancelDrop(slug, admin.id, expectOrders as number);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Copy a drop into a new draft and open it. */
export async function duplicateDropAction(slug: string): Promise<void> {
  await requireAdmin();
  const r = await duplicateDrop(slug);
  if (!r.ok) redirect("/admin/drops");
  redirect(`/admin/drops/${r.slug}?duplicated=1`);
}
