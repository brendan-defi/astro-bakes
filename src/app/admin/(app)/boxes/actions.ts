"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { saveBox } from "@/lib/catalogue";
import { validateBox, type BoxValue, type Errors } from "@/lib/catalogue-rules";

export type SaveBoxResult = { ok: true; slug: string; value: BoxValue } | { ok: false; errors: Errors };

/** Create a box (`slug` null) or save the one with that slug; the shop shows boxes, so the whole site is refreshed. */
export async function saveBoxAction(input: Record<string, unknown>, slug: string | null): Promise<SaveBoxResult> {
  await requireAdmin();
  const r = validateBox(input, { creating: slug === null });
  if (!r.ok) return r;
  const saved = await saveBox(r.value, slug);
  if (!saved.ok) return saved;
  revalidatePath("/", "layout");
  return { ok: true, slug: saved.slug, value: { ...r.value, slug: saved.slug } };
}
