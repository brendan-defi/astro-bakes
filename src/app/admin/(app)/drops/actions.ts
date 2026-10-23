"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { dropContext, duplicateDrop, saveDrop } from "@/lib/drops-admin";
import { validateDrop, type Errors } from "@/lib/drop-rules";

export type SaveDropResult = { ok: true; slug: string } | { ok: false; errors: Errors };

/** Create a draft (`slug` null) or save the drop with that slug. A scheduled or live drop shows on the shop, so the whole site is refreshed. */
export async function saveDropAction(input: Record<string, unknown>, slug: string | null): Promise<SaveDropResult> {
  await requireAdmin();
  const ctx = await dropContext(slug);
  if (!ctx) return { ok: false, errors: { form: "That drop no longer exists." } };
  const r = validateDrop(input, ctx);
  if (!r.ok) return r;
  const saved = await saveDrop(r.value, slug);
  if (saved.ok) revalidatePath("/", "layout");
  return saved;
}

/** Copy a drop into a new draft and open it. */
export async function duplicateDropAction(slug: string): Promise<void> {
  await requireAdmin();
  const r = await duplicateDrop(slug);
  if (!r.ok) redirect("/admin/drops");
  redirect(`/admin/drops/${r.slug}?duplicated=1`);
}
