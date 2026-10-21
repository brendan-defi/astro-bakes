"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { saveItem } from "@/lib/catalogue";
import { validateItem, type Errors, type ItemValue } from "@/lib/catalogue-rules";

export type SaveItemResult = { ok: true; slug: string; value: ItemValue } | { ok: false; errors: Errors };

/** Create an item (`slug` null) or save the one with that slug. */
export async function saveItemAction(input: Record<string, unknown>, slug: string | null): Promise<SaveItemResult> {
  await requireAdmin();
  const r = validateItem(input, { creating: slug === null });
  if (!r.ok) return r;
  const saved = await saveItem(r.value, slug);
  if (!saved.ok) return saved;
  revalidatePath("/", "layout");
  return { ok: true, slug: saved.slug, value: { ...r.value, slug: saved.slug } };
}
